import * as React from "react";
import { cn } from "@/lib/utils";

type StatusKind =
  | "CONNECTED"
  | "ACTIVE"
  | "PENDING"
  | "PROCESSING"
  | "RECEIVED"
  | "COMPLETED"
  | "SUCCESS"
  | "FAILED"
  | "ERROR"
  | "RETRYING"
  | "SKIPPED"
  | "DISABLED"
  | "PARTIAL"
  | "DUPLICATE"
  | "INACTIVE"
  | "RUNNING";

const STYLES: Record<string, string> = {
  green:
    "bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_30%,transparent)]",
  red: "bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)]",
  amber:
    "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]",
  blue: "bg-[color-mix(in_srgb,var(--color-info)_16%,transparent)] text-[var(--color-info)] border-[color-mix(in_srgb,var(--color-info)_30%,transparent)]",
  gray: "bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] border-[var(--color-border)]",
};

const KIND_COLOR: Record<StatusKind, keyof typeof STYLES> = {
  CONNECTED: "green",
  ACTIVE: "green",
  COMPLETED: "green",
  SUCCESS: "green",
  RECEIVED: "blue",
  PROCESSING: "blue",
  RUNNING: "blue",
  PENDING: "amber",
  RETRYING: "amber",
  PARTIAL: "amber",
  FAILED: "red",
  ERROR: "red",
  SKIPPED: "gray",
  DISABLED: "gray",
  INACTIVE: "gray",
  DUPLICATE: "gray",
};

export function Badge({
  children,
  className,
  color,
}: {
  children: React.ReactNode;
  className?: string;
  color?: keyof typeof STYLES;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        STYLES[color ?? "gray"],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const key = status.toUpperCase() as StatusKind;
  const color = KIND_COLOR[key] ?? "gray";
  return (
    <Badge color={color}>
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: "currentColor" }}
      />
      {status}
    </Badge>
  );
}
