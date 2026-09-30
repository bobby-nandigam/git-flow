import { prisma } from "@/server/database/prisma";
import { logger } from "@/server/logger";
import type { NormalizedEvent } from "@/server/webhook/normalize";
import { ruleMatches, type EvaluableRule } from "@/server/automation/rule-engine";
import { getUserGitHubToken } from "@/server/github/token";
import { addTimeline } from "@/server/automation/timeline";
import type { RuleAction } from "@/server/automation/types";
import {
  runAiAction,
  runLabelAction,
  runCommentAction,
  runSlackAction,
  RetryableActionError,
  type ExecContext,
  type SharedState,
} from "@/server/automation/action-executor";

/** Rebuild a NormalizedEvent from the sanitized payload we persisted. */
function normalizedFromStored(p: Record<string, unknown>): NormalizedEvent {
  const fullName = (p.repository as string | undefined) ?? undefined;
  const [owner, name] = fullName ? fullName.split("/") : [undefined, undefined];
  return {
    githubEvent: (p.githubEvent as string) ?? "",
    action: p.action as string | undefined,
    repositoryFullName: fullName,
    repositoryOwner: owner,
    repositoryName: name,
    senderLogin: p.sender as string | undefined,
    number: p.number as number | undefined,
    title: p.title as string | undefined,
    body: p.body as string | undefined,
    authorLogin: p.author as string | undefined,
    labels: (p.labels as string[] | undefined) ?? [],
    merged: p.merged as boolean | undefined,
    ref: p.ref as string | undefined,
    commitCount: p.commitCount as number | undefined,
    htmlUrl: p.htmlUrl as string | undefined,
  };
}

function ruleTypeFor(n: NormalizedEvent): string | null {
  switch (n.githubEvent) {
    case "issues":
      if (n.action === "opened") return "ISSUE_OPENED";
      if (n.action === "closed") return "ISSUE_CLOSED";
      if (n.action === "edited") return "ISSUE_EDITED";
      return null;
    case "pull_request":
      if (n.action === "opened") return "PR_OPENED";
      if (n.action === "closed") return n.merged ? "PR_MERGED" : "PR_CLOSED";
      return null;
    case "push":
      return "PUSH";
    default:
      return null;
  }
}

function eventLabelFor(n: NormalizedEvent): string {
  const map: Record<string, string> = {
    ISSUE_OPENED: "Issue opened",
    ISSUE_CLOSED: "Issue closed",
    ISSUE_EDITED: "Issue edited",
    PR_OPENED: "Pull request opened",
    PR_CLOSED: "Pull request closed",
    PR_MERGED: "Pull request merged",
    PUSH: "Push",
  };
  const rt = ruleTypeFor(n);
  return (rt && map[rt]) || `${n.githubEvent} ${n.action ?? ""}`.trim();
}

/** Deterministic action ordering: AI first (feeds comment/Slack), Slack last. */
function orderActions(actions: RuleAction[]): RuleAction[] {
  const rank: Record<RuleAction["type"], number> = {
    AI_TRIAGE: 0,
    GITHUB_LABEL: 1,
    GITHUB_COMMENT: 2,
    SLACK_NOTIFY: 3,
  };
  return [...actions].sort((a, b) => rank[a.type] - rank[b.type]);
}

/**
 * Process one webhook event end-to-end. Idempotent: safe to call again after a
 * retry — already-completed events short-circuit, and already-succeeded actions
 * are skipped so side effects (labels, Slack) are not duplicated.
 *
 * Throws RetryableActionError when a downstream failure warrants a job retry.
 */
export async function processWebhookEvent(webhookEventId: string): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
    include: { repository: true },
  });
  if (!event) {
    logger.warn("process_missing_event", { webhookEventId });
    return;
  }
  if (event.status === "COMPLETED") return; // idempotent no-op

  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: { status: "PROCESSING", attemptCount: { increment: 1 } },
  });

  const normalized = normalizedFromStored(
    event.payload as Record<string, unknown>,
  );
  const ruleType = ruleTypeFor(normalized);

  // Event not tied to a tracked repository -> nothing to automate.
  if (!event.repository) {
    await complete(webhookEventId, "SKIPPED", "No tracked repository for event");
    return;
  }
  if (!ruleType) {
    await complete(
      webhookEventId,
      "COMPLETED",
      "No applicable rule event type",
    );
    return;
  }

  const dbRules = await prisma.automationRule.findMany({
    where: {
      repositoryId: event.repository.id,
      enabled: true,
      eventType: ruleType as never,
    },
    orderBy: { priority: "desc" },
  });

  const matched = dbRules.filter((r) =>
    ruleMatches(r as unknown as EvaluableRule, normalized, ruleType),
  );

  if (matched.length === 0) {
    await complete(webhookEventId, "COMPLETED", "No rules matched");
    return;
  }

  await addTimeline(
    webhookEventId,
    "rules_matched",
    `${matched.length} rule(s) matched`,
    { rules: matched.map((r) => r.name) },
  );

  // Memoized token accessor — fetched only if a GitHub action needs it.
  let cachedToken: string | null = null;
  const getToken = async () => {
    if (cachedToken) return cachedToken;
    cachedToken = await getUserGitHubToken(event.repository!.userId);
    return cachedToken;
  };

  let anyFailed = false;

  for (const rule of matched) {
    const execution = await prisma.automationExecution.upsert({
      where: {
        webhookEventId_ruleId: { webhookEventId, ruleId: rule.id },
      },
      create: {
        webhookEventId,
        ruleId: rule.id,
        ruleName: rule.name,
        repositoryId: event.repository.id,
        matched: true,
        status: "RUNNING",
        startedAt: new Date(),
      },
      update: { status: "RUNNING", startedAt: new Date() },
    });

    if (execution.status === "COMPLETED") continue;

    const ctx: ExecContext = {
      webhookEventId,
      executionId: execution.id,
      userId: event.repository.userId,
      repoOwner: event.repository.owner,
      repoName: event.repository.name,
      repoFullName: event.repository.fullName,
      repositoryId: event.repository.id,
      issueNumber: normalized.number,
      normalized,
      eventLabel: eventLabelFor(normalized),
      ruleName: rule.name,
      getToken,
    };

    const state: SharedState = { ai: null, summaries: [] };

    // Reuse a prior successful AI result on retry so we don't re-call the model.
    const priorAi = await prisma.aiResult.findUnique({
      where: { executionId: execution.id },
    });
    if (priorAi) {
      state.ai = {
        summary: priorAi.summary ?? "",
        category: (priorAi.category as never) ?? "other",
        priority: (priorAi.priority as never) ?? "low",
        suggestedLabel: priorAi.suggestedLabel ?? "",
        reason: priorAi.reason ?? "",
      };
    }

    const actions = orderActions(
      (Array.isArray(rule.actions) ? rule.actions : []) as RuleAction[],
    );

    const start = Date.now();
    try {
      for (const action of actions) {
        if (await alreadySucceeded(execution.id, action, state)) continue;
        switch (action.type) {
          case "AI_TRIAGE":
            if (!state.ai) await runAiAction(ctx, state);
            else state.summaries.push("✓ AI triage completed");
            break;
          case "GITHUB_LABEL":
            await runLabelAction(ctx, state, action.label);
            break;
          case "GITHUB_COMMENT":
            await runCommentAction(ctx, state, action.template);
            break;
          case "SLACK_NOTIFY":
            await runSlackAction(ctx, state);
            break;
        }
      }
    } catch (err) {
      if (err instanceof RetryableActionError) {
        // Persist partial progress and rethrow so the job queue retries.
        await prisma.automationExecution.update({
          where: { id: execution.id },
          data: { status: "PARTIAL", finishedAt: new Date() },
        });
        await prisma.webhookEvent.update({
          where: { id: webhookEventId },
          data: { status: "PROCESSING", errorMessage: err.message },
        });
        throw err;
      }
      throw err;
    }

    // Determine final execution status from its action rows.
    const actionRows = await prisma.actionExecution.findMany({
      where: { executionId: execution.id },
      select: { status: true },
    });
    const hasFailed = actionRows.some((a) => a.status === "FAILED");
    if (hasFailed) anyFailed = true;

    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: {
        status: hasFailed ? "PARTIAL" : "COMPLETED",
        finishedAt: new Date(),
        durationMs: Date.now() - start,
      },
    });
  }

  await complete(
    webhookEventId,
    "COMPLETED",
    anyFailed
      ? "Completed with one or more non-retryable action failures"
      : "Completed",
  );
}

/** Whether an action already succeeded/was skipped in a prior attempt. */
async function alreadySucceeded(
  executionId: string,
  action: RuleAction,
  state: SharedState,
): Promise<boolean> {
  const existing = await prisma.actionExecution.findFirst({
    where: {
      executionId,
      type: action.type,
      status: { in: ["SUCCESS", "SKIPPED"] },
      ...(action.type === "GITHUB_LABEL"
        ? { detail: { path: ["label"], equals: action.label } }
        : {}),
    },
  });
  if (existing) {
    // Re-derive a summary line so Slack (if it runs later) still lists it.
    if (action.type === "GITHUB_LABEL")
      state.summaries.push(`✓ Added label: ${action.label}`);
    if (action.type === "GITHUB_COMMENT")
      state.summaries.push("✓ Posted GitHub comment");
    if (action.type === "AI_TRIAGE") state.summaries.push("✓ AI triage completed");
    return true;
  }
  return false;
}

async function complete(
  webhookEventId: string,
  status: "COMPLETED" | "SKIPPED",
  note: string,
) {
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      status,
      processedAt: new Date(),
      errorMessage: status === "COMPLETED" ? null : note,
    },
  });
  await addTimeline(webhookEventId, "execution_completed", note);
}
