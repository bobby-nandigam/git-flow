import type { NormalizedEvent } from "@/server/webhook/normalize";
import {
  conditionSchema,
  type Condition,
} from "@/server/automation/types";

/**
 * Pure, deterministic rule evaluation. No I/O — trivially unit-testable.
 *
 * A rule matches when its eventType matches the normalized event AND all of its
 * conditions pass (AND semantics). Conditions are validated before evaluation;
 * invalid conditions are treated as non-matching (fail closed).
 */

function fieldValue(
  field: Condition["field"],
  event: NormalizedEvent,
): { text: string; labels: string[] } {
  switch (field) {
    case "title":
      return { text: event.title ?? "", labels: event.labels };
    case "body":
      return { text: event.body ?? "", labels: event.labels };
    case "author":
      return { text: event.authorLogin ?? "", labels: event.labels };
    case "label":
      return { text: "", labels: event.labels };
    default:
      return { text: "", labels: [] };
  }
}

export function evaluateCondition(
  condition: Condition,
  event: NormalizedEvent,
): boolean {
  const parsed = conditionSchema.safeParse(condition);
  if (!parsed.success) return false;
  const c = parsed.data;
  const { text, labels } = fieldValue(c.field, event);
  const needle = c.value.toLowerCase();
  const hay = text.toLowerCase();
  const lowerLabels = labels.map((l) => l.toLowerCase());

  switch (c.operator) {
    case "contains":
      return hay.includes(needle);
    case "not_contains":
      return !hay.includes(needle);
    case "equals":
      return hay.trim() === needle.trim();
    case "not_equals":
      return hay.trim() !== needle.trim();
    case "has_label":
      return lowerLabels.includes(needle);
    case "not_has_label":
      return !lowerLabels.includes(needle);
    default:
      return false;
  }
}

export interface EvaluableRule {
  id: string;
  name: string;
  enabled: boolean;
  eventType: string;
  conditions: unknown; // JSON from DB
}

/** Returns true if the rule's eventType applies to this normalized event. */
export function ruleEventMatches(
  ruleEventType: string,
  normalizedRuleType: string | null,
): boolean {
  return normalizedRuleType != null && ruleEventType === normalizedRuleType;
}

/** Evaluate a single rule against an event (event-type + all conditions). */
export function ruleMatches(
  rule: EvaluableRule,
  event: NormalizedEvent,
  normalizedRuleType: string | null,
): boolean {
  if (!rule.enabled) return false;
  if (!ruleEventMatches(rule.eventType, normalizedRuleType)) return false;

  const conditions = Array.isArray(rule.conditions)
    ? (rule.conditions as Condition[])
    : [];

  // No conditions => matches on event type alone.
  return conditions.every((cond) => evaluateCondition(cond, event));
}
