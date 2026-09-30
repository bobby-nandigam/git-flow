"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { EventDetail } from "@/types/dto";
import { PageHeader, ActionPill, eventTitle } from "@/components/dashboard/shared";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { formatTimestamp } from "@/lib/utils";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => apiGet<EventDetail>(`/api/events/${id}`),
    refetchInterval: (q) =>
      ["COMPLETED", "FAILED", "SKIPPED"].includes(
        (q.state.data as EventDetail | undefined)?.status ?? "",
      )
        ? false
        : 4000,
  });

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader title="Event" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/dashboard/events"
        className="mb-4 inline-block text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        ← Back to events
      </Link>
      <PageHeader
        title={eventTitle(data.githubEvent, data.action)}
        description={data.title ?? undefined}
        action={<StatusBadge status={data.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Executions */}
          {data.executions.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-[var(--color-fg-muted)]">
                No rules matched this event.
              </CardContent>
            </Card>
          ) : (
            data.executions.map((ex) => (
              <Card key={ex.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{ex.ruleName}</CardTitle>
                  <div className="flex items-center gap-2">
                    {ex.durationMs != null && (
                      <span className="text-[11px] text-[var(--color-fg-subtle)]">
                        {ex.durationMs}ms
                      </span>
                    )}
                    <StatusBadge status={ex.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {ex.actions.map((a) => (
                      <ActionPill key={a.id} type={a.type} status={a.status} />
                    ))}
                  </div>
                  {ex.actions.some((a) => a.error) && (
                    <div className="space-y-1">
                      {ex.actions
                        .filter((a) => a.error)
                        .map((a) => (
                          <p key={a.id} className="text-[11px] text-[var(--color-danger)]">
                            {a.type}: {a.error}
                          </p>
                        ))}
                    </div>
                  )}
                  {ex.aiResult && (
                    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                      <p className="mb-2 text-xs font-semibold text-[var(--color-fg)]">
                        AI triage
                      </p>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <dt className="text-[var(--color-fg-subtle)]">Category</dt>
                          <dd className="text-[var(--color-fg)]">{ex.aiResult.category}</dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-fg-subtle)]">Priority</dt>
                          <dd className="text-[var(--color-fg)]">{ex.aiResult.priority}</dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-fg-subtle)]">Suggested label</dt>
                          <dd className="mono text-[var(--color-fg)]">{ex.aiResult.suggestedLabel}</dd>
                        </div>
                      </dl>
                      {ex.aiResult.summary && (
                        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
                          {ex.aiResult.summary}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Execution timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-3 border-l border-[var(--color-border)] pl-4">
                {data.timeline.map((t) => (
                  <li key={t.id} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-[var(--color-primary)]" />
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-[var(--color-fg)]">{t.message}</span>
                      <span className="mono shrink-0 text-[11px] text-[var(--color-fg-subtle)]">
                        {new Date(t.at).toLocaleTimeString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Metadata */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-xs">
                <Meta label="Repository" value={data.repositoryFullName ?? "—"} mono />
                <Meta label="GitHub event" value={data.githubEvent} mono />
                <Meta label="Action" value={data.action ?? "—"} />
                <Meta label="Delivery ID" value={data.githubDeliveryId} mono />
                <Meta label="Sender" value={data.senderLogin ?? "—"} />
                <Meta label="Received" value={formatTimestamp(data.receivedAt)} />
                <Meta
                  label="Processed"
                  value={data.processedAt ? formatTimestamp(data.processedAt) : "—"}
                />
                <Meta label="Attempts" value={String(data.attemptCount)} />
              </dl>
              {data.errorMessage && (
                <p className="mt-3 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-2 text-[11px] text-[var(--color-danger)]">
                  {data.errorMessage}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payload (sanitized)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="mono max-h-72 overflow-auto rounded-[var(--radius)] bg-[var(--color-bg)] p-3 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
                {JSON.stringify(data.payload, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--color-fg-subtle)]">{label}</dt>
      <dd
        className={`truncate text-right text-[var(--color-fg)] ${mono ? "mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
