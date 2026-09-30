import { z } from "zod";

/**
 * Rule schema — rules are DATA, validated with Zod, never code. The webhook
 * handler and worker treat these as untrusted input and validate before use.
 */

export const RULE_EVENT_TYPES = [
  "ISSUE_OPENED",
  "ISSUE_CLOSED",
  "ISSUE_EDITED",
  "PR_OPENED",
  "PR_CLOSED",
  "PR_MERGED",
  "PUSH",
] as const;

export const CONDITION_FIELDS = [
  "title",
  "body",
  "author",
  "label",
] as const;

export const CONDITION_OPERATORS = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "has_label",
  "not_has_label",
] as const;

export const conditionSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.string().min(1).max(200),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("GITHUB_LABEL"),
    label: z.string().min(1).max(50),
  }),
  z.object({
    type: z.literal("GITHUB_COMMENT"),
    // Optional template; if omitted and AI ran, we render an AI triage comment.
    template: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal("SLACK_NOTIFY"),
  }),
  z.object({
    type: z.literal("AI_TRIAGE"),
  }),
]);

export const ruleInputSchema = z.object({
  name: z.string().min(1).max(120),
  repositoryId: z.string().min(1),
  eventType: z.enum(RULE_EVENT_TYPES),
  enabled: z.boolean().default(true),
  conditions: z.array(conditionSchema).max(20).default([]),
  actions: z.array(actionSchema).min(1).max(10),
  priority: z.number().int().min(0).max(1000).default(0),
});

export const ruleUpdateSchema = ruleInputSchema.partial().omit({
  repositoryId: true,
});

export type Condition = z.infer<typeof conditionSchema>;
export type RuleAction = z.infer<typeof actionSchema>;
export type RuleInput = z.infer<typeof ruleInputSchema>;
