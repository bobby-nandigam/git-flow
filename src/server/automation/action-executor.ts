import { Prisma } from "@prisma/client";
import { prisma } from "@/server/database/prisma";
import { logger } from "@/server/logger";
import { decryptSecret } from "@/server/security/crypto";
import { env } from "@/lib/env";
import type { NormalizedEvent } from "@/server/webhook/normalize";
import type { RuleAction } from "@/server/automation/types";
import {
  addIssueLabels,
  createIssueComment,
  getIssueLabels,
  GitHubError,
} from "@/server/github/client";
import { sendSlackNotification, SlackError } from "@/server/slack/client";
import { runTriage, AiError, type TriageResult } from "@/server/ai/triage";
import { GitHubTokenError } from "@/server/github/token";
import { addTimeline } from "@/server/automation/timeline";

/** Thrown when an action fails in a way that should trigger a job retry. */
export class RetryableActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableActionError";
  }
}

export interface ExecContext {
  webhookEventId: string;
  executionId: string;
  userId: string;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  repositoryId: string;
  issueNumber?: number;
  normalized: NormalizedEvent;
  eventLabel: string;
  ruleName: string;
  getToken: () => Promise<string>;
}

export interface SharedState {
  ai: TriageResult | null;
  summaries: string[]; // human-readable action outcomes for Slack
}

async function recordAction(
  ctx: ExecContext,
  type: RuleAction["type"],
  detail: Record<string, unknown> | undefined,
) {
  return prisma.actionExecution.create({
    data: {
      executionId: ctx.executionId,
      webhookEventId: ctx.webhookEventId,
      type,
      status: "PENDING",
      detail: (detail ?? undefined) as Prisma.InputJsonValue | undefined,
      startedAt: new Date(),
      attempts: 1,
    },
  });
}

async function finishAction(
  id: string,
  status: "SUCCESS" | "FAILED" | "SKIPPED",
  extra: { result?: Record<string, unknown>; error?: string } = {},
) {
  await prisma.actionExecution.update({
    where: { id },
    data: {
      status,
      result: (extra.result ?? undefined) as Prisma.InputJsonValue | undefined,
      error: extra.error ?? undefined,
      finishedAt: new Date(),
    },
  });
}

// ---- AI triage --------------------------------------------------------------

export async function runAiAction(
  ctx: ExecContext,
  state: SharedState,
): Promise<void> {
  const action = await recordAction(ctx, "AI_TRIAGE", undefined);

  if (!env.isAiConfigured) {
    await finishAction(action.id, "SKIPPED", {
      result: { note: "AI provider not configured" },
    });
    return;
  }
  if (ctx.normalized.githubEvent === "push") {
    await finishAction(action.id, "SKIPPED", {
      result: { note: "AI triage not applicable to push events" },
    });
    return;
  }

  await addTimeline(ctx.webhookEventId, "ai_started", "AI triage started");
  try {
    const result = await runTriage({
      kind:
        ctx.normalized.githubEvent === "pull_request"
          ? "pull_request"
          : "issue",
      title: ctx.normalized.title ?? "",
      body: ctx.normalized.body ?? "",
      repository: ctx.repoFullName,
    });
    state.ai = result;

    await prisma.aiResult.upsert({
      where: { executionId: ctx.executionId },
      create: {
        executionId: ctx.executionId,
        webhookEventId: ctx.webhookEventId,
        provider: env.AI_PROVIDER,
        model: env.AI_PROVIDER === "groq" ? env.GROQ_MODEL : env.GEMINI_MODEL,
        summary: result.summary,
        category: result.category,
        priority: result.priority,
        suggestedLabel: result.suggestedLabel,
        reason: result.reason,
        raw: result as unknown as Prisma.InputJsonValue,
      },
      update: {
        summary: result.summary,
        category: result.category,
        priority: result.priority,
        suggestedLabel: result.suggestedLabel,
        reason: result.reason,
        raw: result as unknown as Prisma.InputJsonValue,
      },
    });

    await finishAction(action.id, "SUCCESS", {
      result: {
        category: result.category,
        priority: result.priority,
        suggestedLabel: result.suggestedLabel,
      },
    });
    state.summaries.push("✓ AI triage completed");
    await addTimeline(ctx.webhookEventId, "ai_completed", "AI triage completed");
  } catch (err) {
    const retryable = err instanceof AiError && err.retryable;
    await finishAction(action.id, "FAILED", {
      error: (err as Error).message,
    });
    await addTimeline(
      ctx.webhookEventId,
      "ai_failed",
      `AI triage failed: ${(err as Error).message}`,
    );
    state.summaries.push("✗ AI triage failed");
    if (retryable) throw new RetryableActionError((err as Error).message);
    // Non-retryable: AI is optional; swallow and continue.
  }
}

// ---- GitHub label -----------------------------------------------------------

export async function runLabelAction(
  ctx: ExecContext,
  state: SharedState,
  label: string,
): Promise<void> {
  const action = await recordAction(ctx, "GITHUB_LABEL", { label });

  if (ctx.issueNumber == null) {
    await finishAction(action.id, "SKIPPED", {
      result: { note: "No issue/PR number for label action" },
    });
    return;
  }

  try {
    const token = await ctx.getToken();
    // Idempotency: don't add a label that already exists on the issue.
    const existing = await getIssueLabels(
      token,
      ctx.repoOwner,
      ctx.repoName,
      ctx.issueNumber,
    );
    if (existing.some((l) => l.toLowerCase() === label.toLowerCase())) {
      await finishAction(action.id, "SKIPPED", {
        result: { note: `Label "${label}" already present` },
      });
      state.summaries.push(`• Label "${label}" already present`);
      await addTimeline(
        ctx.webhookEventId,
        "label_skipped",
        `Label "${label}" already present — skipped`,
      );
      return;
    }

    await addIssueLabels(token, ctx.repoOwner, ctx.repoName, ctx.issueNumber, [
      label,
    ]);
    await finishAction(action.id, "SUCCESS", { result: { label } });
    state.summaries.push(`✓ Added label: ${label}`);
    await addTimeline(
      ctx.webhookEventId,
      "label_added",
      `Added GitHub label "${label}"`,
    );
  } catch (err) {
    await handleGithubActionError(ctx, action.id, state, err, "GitHub label");
  }
}

// ---- GitHub comment ---------------------------------------------------------

export async function runCommentAction(
  ctx: ExecContext,
  state: SharedState,
  template: string | undefined,
): Promise<void> {
  const action = await recordAction(ctx, "GITHUB_COMMENT", undefined);

  if (ctx.issueNumber == null) {
    await finishAction(action.id, "SKIPPED", {
      result: { note: "No issue/PR number for comment action" },
    });
    return;
  }

  const body = renderComment(template, state.ai, ctx.ruleName);
  try {
    const token = await ctx.getToken();
    const res = await createIssueComment(
      token,
      ctx.repoOwner,
      ctx.repoName,
      ctx.issueNumber,
      body,
    );
    await finishAction(action.id, "SUCCESS", { result: { url: res.html_url } });
    state.summaries.push("✓ Posted GitHub comment");
    await addTimeline(
      ctx.webhookEventId,
      "comment_posted",
      "Posted GitHub comment",
    );
  } catch (err) {
    await handleGithubActionError(ctx, action.id, state, err, "GitHub comment");
  }
}

function renderComment(
  template: string | undefined,
  ai: TriageResult | null,
  ruleName: string,
): string {
  if (template && template.trim()) return template;
  if (ai) {
    return [
      "**Automated triage** (via GitFlow Automator)",
      "",
      `**Summary:** ${ai.summary}`,
      `**Category:** ${ai.category}`,
      `**Priority:** ${ai.priority}`,
      `**Suggested label:** \`${ai.suggestedLabel}\``,
      "",
      `_Rule: ${ruleName}_`,
    ].join("\n");
  }
  return `Thanks for the contribution — automatically acknowledged by GitFlow Automator (rule: ${ruleName}).`;
}

async function handleGithubActionError(
  ctx: ExecContext,
  actionId: string,
  state: SharedState,
  err: unknown,
  label: string,
) {
  const retryable = err instanceof GitHubError && err.retryable;
  const message =
    err instanceof GitHubTokenError
      ? "GitHub token invalid — user must reconnect"
      : (err as Error).message;
  await finishAction(actionId, "FAILED", { error: message });
  state.summaries.push(`✗ ${label} failed`);
  await addTimeline(
    ctx.webhookEventId,
    "action_failed",
    `${label} failed: ${message}`,
  );
  logger.warn("github_action_failed", {
    webhookEventId: ctx.webhookEventId,
    label,
    retryable,
  });
  if (retryable) throw new RetryableActionError(message);
}

// ---- Slack ------------------------------------------------------------------

async function resolveSlackWebhookUrl(
  userId: string,
  repositoryId: string,
): Promise<string | null> {
  const integration = await prisma.slackIntegration.findFirst({
    where: {
      userId,
      enabled: true,
      OR: [{ repositoryId }, { repositoryId: null }],
    },
    orderBy: { repositoryId: "desc" }, // repo-specific first (non-null sorts before null desc)
  });
  if (integration) {
    try {
      return decryptSecret(integration.webhookUrlEnc);
    } catch {
      return null;
    }
  }
  return env.SLACK_WEBHOOK_URL || null;
}

export async function runSlackAction(
  ctx: ExecContext,
  state: SharedState,
): Promise<void> {
  const action = await recordAction(ctx, "SLACK_NOTIFY", undefined);

  const url = await resolveSlackWebhookUrl(ctx.userId, ctx.repositoryId);
  if (!url) {
    await finishAction(action.id, "SKIPPED", {
      result: { note: "No Slack webhook configured" },
    });
    return;
  }

  try {
    await sendSlackNotification(url, {
      repositoryFullName: ctx.repoFullName,
      eventLabel: ctx.eventLabel,
      title: ctx.normalized.title,
      author: ctx.normalized.authorLogin,
      ruleName: ctx.ruleName,
      actions: state.summaries.length
        ? state.summaries
        : ["Rule matched"],
      priority: state.ai?.priority,
      url: ctx.normalized.htmlUrl,
    });
    await finishAction(action.id, "SUCCESS", {});
    await addTimeline(ctx.webhookEventId, "slack_sent", "Slack notification sent");
  } catch (err) {
    const retryable = err instanceof SlackError && err.retryable;
    await finishAction(action.id, "FAILED", { error: (err as Error).message });
    await addTimeline(
      ctx.webhookEventId,
      "slack_failed",
      `Slack notification failed: ${(err as Error).message}`,
    );
    logger.warn("slack_action_failed", {
      webhookEventId: ctx.webhookEventId,
      retryable,
    });
    if (retryable) throw new RetryableActionError((err as Error).message);
  }
}
