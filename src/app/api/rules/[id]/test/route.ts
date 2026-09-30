import { z } from "zod";
import { prisma } from "@/server/database/prisma";
import { requireUserId } from "@/server/auth/session";
import { ok, withErrors, ApiError } from "@/server/http";
import {
  evaluateCondition,
  ruleEventMatches,
} from "@/server/automation/rule-engine";
import type { Condition } from "@/server/automation/types";
import type { NormalizedEvent } from "@/server/webhook/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sampleSchema = z.object({
  title: z.string().default(""),
  body: z.string().default(""),
  author: z.string().default(""),
  labels: z.array(z.string()).default([]),
});

/**
 * Dry-run a rule against a sample event. Pure evaluation, no side effects —
 * lets users validate rules before enabling them.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const rule = await prisma.automationRule.findUnique({ where: { id } });
    if (!rule || rule.userId !== userId) throw new ApiError("Rule not found", 404);

    const sample = sampleSchema.parse(await req.json().catch(() => ({})));
    const normalized: NormalizedEvent = {
      githubEvent: "issues",
      title: sample.title,
      body: sample.body,
      authorLogin: sample.author,
      labels: sample.labels,
    };

    const conditions = (
      Array.isArray(rule.conditions) ? rule.conditions : []
    ) as Condition[];

    const conditionResults = conditions.map((c) => ({
      condition: c,
      passed: evaluateCondition(c, normalized),
    }));

    // For the test we compare event-type at the rule's own type (it's a dry run
    // against a synthetic event), so we report condition matching independently.
    const eventTypeMatches = ruleEventMatches(rule.eventType, rule.eventType);
    const allConditionsPass = conditionResults.every((r) => r.passed);
    const matched = rule.enabled && eventTypeMatches && allConditionsPass;

    return ok({
      matched,
      enabled: rule.enabled,
      eventTypeMatches,
      conditionResults,
    });
  });
}
