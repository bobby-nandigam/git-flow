"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { X, Plus } from "lucide-react";
import type { RepositoryItem, RuleItem } from "@/types/dto";

export const EVENT_TYPES = [
  { value: "ISSUE_OPENED", label: "Issue opened" },
  { value: "ISSUE_CLOSED", label: "Issue closed" },
  { value: "ISSUE_EDITED", label: "Issue edited" },
  { value: "PR_OPENED", label: "Pull request opened" },
  { value: "PR_CLOSED", label: "Pull request closed" },
  { value: "PR_MERGED", label: "Pull request merged" },
  { value: "PUSH", label: "Push" },
];

const FIELDS = ["title", "body", "author", "label"];
const OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "has_label", label: "has label" },
  { value: "not_has_label", label: "does not have label" },
];

interface Condition {
  field: string;
  operator: string;
  value: string;
}
interface ActionState {
  label: boolean;
  labelValue: string;
  comment: boolean;
  commentTemplate: string;
  slack: boolean;
  ai: boolean;
}

export interface RuleFormValue {
  name: string;
  repositoryId: string;
  eventType: string;
  enabled: boolean;
  conditions: Condition[];
  actions: { type: string; label?: string; template?: string }[];
}

export function ruleToForm(rule: RuleItem): RuleFormValue {
  return {
    name: rule.name,
    repositoryId: rule.repositoryId,
    eventType: rule.eventType,
    enabled: rule.enabled,
    conditions: rule.conditions ?? [],
    actions: rule.actions ?? [],
  };
}

export function RuleEditor({
  repositories,
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  repositories: RepositoryItem[];
  initial?: RuleItem;
  onCancel: () => void;
  onSubmit: (value: RuleFormValue) => void;
  submitting: boolean;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [repositoryId, setRepositoryId] = React.useState(
    initial?.repositoryId ?? repositories[0]?.id ?? "",
  );
  const [eventType, setEventType] = React.useState(
    initial?.eventType ?? "ISSUE_OPENED",
  );
  const [enabled, setEnabled] = React.useState(initial?.enabled ?? true);
  const [conditions, setConditions] = React.useState<Condition[]>(
    initial?.conditions ?? [{ field: "title", operator: "contains", value: "" }],
  );
  const [actions, setActions] = React.useState<ActionState>(() => ({
    label: initial?.actions.some((a) => a.type === "GITHUB_LABEL") ?? true,
    labelValue:
      initial?.actions.find((a) => a.type === "GITHUB_LABEL")?.label ?? "bug",
    comment: initial?.actions.some((a) => a.type === "GITHUB_COMMENT") ?? false,
    commentTemplate:
      initial?.actions.find((a) => a.type === "GITHUB_COMMENT")?.template ?? "",
    slack: initial?.actions.some((a) => a.type === "SLACK_NOTIFY") ?? true,
    ai: initial?.actions.some((a) => a.type === "AI_TRIAGE") ?? false,
  }));
  const [error, setError] = React.useState<string | null>(null);

  function updateCondition(i: number, patch: Partial<Condition>) {
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function buildActions() {
    const out: { type: string; label?: string; template?: string }[] = [];
    if (actions.ai) out.push({ type: "AI_TRIAGE" });
    if (actions.label) out.push({ type: "GITHUB_LABEL", label: actions.labelValue.trim() });
    if (actions.comment)
      out.push({
        type: "GITHUB_COMMENT",
        ...(actions.commentTemplate.trim()
          ? { template: actions.commentTemplate.trim() }
          : {}),
      });
    if (actions.slack) out.push({ type: "SLACK_NOTIFY" });
    return out;
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("Rule name is required.");
    if (!repositoryId) return setError("Select a repository.");
    const built = buildActions();
    if (built.length === 0) return setError("Select at least one action.");
    if (actions.label && !actions.labelValue.trim())
      return setError("Label action needs a label name.");
    const cleanConditions = conditions.filter((c) => c.value.trim());
    onSubmit({
      name: name.trim(),
      repositoryId,
      eventType,
      enabled,
      conditions: cleanConditions,
      actions: built,
    });
  }

  return (
    <Card className="mb-6 border-[var(--color-border-strong)]">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{initial ? "Edit rule" : "Create automation rule"}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Rule name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bug issue automation"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Repository</Label>
            <Select
              value={repositoryId}
              onChange={(e) => setRepositoryId(e.target.value)}
              disabled={!!initial}
            >
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Trigger event</Label>
            <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
            <span className="text-xs text-[var(--color-fg-muted)]">
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        {/* Conditions */}
        <div>
          <Label>Conditions (all must match)</Label>
          <div className="mt-2 space-y-2">
            {conditions.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  value={c.field}
                  onChange={(e) => updateCondition(i, { field: e.target.value })}
                  className="w-28"
                >
                  {FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
                <Select
                  value={c.operator}
                  onChange={(e) => updateCondition(i, { operator: e.target.value })}
                  className="w-44"
                >
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Input
                  value={c.value}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  placeholder="value"
                  className="w-40 flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setConditions((cs) => [
                  ...cs,
                  { field: "title", operator: "contains", value: "" },
                ])
              }
            >
              <Plus className="size-3.5" /> Add condition
            </Button>
            <p className="text-[11px] text-[var(--color-fg-subtle)]">
              No conditions means the rule matches on the trigger event alone.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div>
          <Label>Actions</Label>
          <div className="mt-2 space-y-2">
            <ActionRow
              checked={actions.ai}
              onChange={(v) => setActions((a) => ({ ...a, ai: v }))}
              title="AI triage"
              hint="Summarize & classify (requires an AI key)"
            />
            <ActionRow
              checked={actions.label}
              onChange={(v) => setActions((a) => ({ ...a, label: v }))}
              title="Add GitHub label"
            >
              {actions.label && (
                <Input
                  value={actions.labelValue}
                  onChange={(e) =>
                    setActions((a) => ({ ...a, labelValue: e.target.value }))
                  }
                  placeholder="bug"
                  className="mt-2 w-40"
                />
              )}
            </ActionRow>
            <ActionRow
              checked={actions.comment}
              onChange={(v) => setActions((a) => ({ ...a, comment: v }))}
              title="Post GitHub comment"
              hint="Leave template empty to auto-render AI triage"
            >
              {actions.comment && (
                <Textarea
                  value={actions.commentTemplate}
                  onChange={(e) =>
                    setActions((a) => ({ ...a, commentTemplate: e.target.value }))
                  }
                  placeholder="Optional custom comment…"
                  className="mt-2"
                />
              )}
            </ActionRow>
            <ActionRow
              checked={actions.slack}
              onChange={(v) => setActions((a) => ({ ...a, slack: v }))}
              title="Send Slack notification"
              hint="Requires a configured Slack webhook"
            />
          </div>
        </div>

        {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : initial ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionRow({
  checked,
  onChange,
  title,
  hint,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] p-3">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-[var(--color-primary)]"
        />
        <span className="text-sm text-[var(--color-fg)]">{title}</span>
        {hint && (
          <span className="text-[11px] text-[var(--color-fg-subtle)]">{hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}
