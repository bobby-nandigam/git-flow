import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-fg)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--color-success)]"
      : tone === "danger"
        ? "text-[var(--color-danger)]"
        : tone === "warning"
          ? "text-[var(--color-warning)]"
          : "text-[var(--color-fg)]";
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{hint}</p>}
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  issues: "Issue",
  pull_request: "Pull request",
  push: "Push",
};

export function eventTitle(githubEvent: string, action?: string | null): string {
  const base = EVENT_LABELS[githubEvent] ?? githubEvent;
  return action ? `${base} ${action}` : base;
}

const ACTION_LABELS: Record<string, string> = {
  GITHUB_LABEL: "Label",
  GITHUB_COMMENT: "Comment",
  SLACK_NOTIFY: "Slack",
  AI_TRIAGE: "AI triage",
};

export function ActionPill({
  type,
  status,
}: {
  type: string;
  status: string;
}) {
  const ok = status === "SUCCESS";
  const skipped = status === "SKIPPED";
  const failed = status === "FAILED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
        ok &&
          "border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] text-[var(--color-success)]",
        failed &&
          "border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] text-[var(--color-danger)]",
        (skipped || (!ok && !failed)) &&
          "border-[var(--color-border)] text-[var(--color-fg-muted)]",
      )}
    >
      {ok ? "✓" : failed ? "✗" : skipped ? "–" : "•"} {ACTION_LABELS[type] ?? type}
    </span>
  );
}
