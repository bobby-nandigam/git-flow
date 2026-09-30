"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { EventsResponse } from "@/types/dto";
import { PageHeader, ActionPill, eventTitle } from "@/components/dashboard/shared";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { timeAgo } from "@/lib/utils";
import { Activity } from "lucide-react";

const STATUSES = ["", "RECEIVED", "PROCESSING", "COMPLETED", "FAILED", "SKIPPED"];

export default function EventsPage() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("");

  const query = useQuery({
    queryKey: ["events", page, status],
    queryFn: () =>
      apiGet<EventsResponse>(
        `/api/events?page=${page}${status ? `&status=${status}` : ""}`,
      ),
    refetchInterval: 6000,
  });

  return (
    <div>
      <PageHeader
        title="Events"
        description="Every webhook delivery, its matched rules, actions and processing status."
        action={
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-40"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </Select>
        }
      />

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : query.data && query.data.events.length > 0 ? (
            <ul className="divide-y divide-[var(--color-border)]">
              {query.data.events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/events/${e.id}`}
                    className="flex items-start gap-3 p-4 transition-colors hover:bg-[var(--color-surface-2)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-fg)]">
                          {eventTitle(e.githubEvent, e.action)}
                        </span>
                        <span className="mono text-xs text-[var(--color-fg-subtle)]">
                          {e.repositoryFullName}
                        </span>
                        {e.senderLogin && (
                          <span className="text-xs text-[var(--color-fg-subtle)]">
                            by {e.senderLogin}
                          </span>
                        )}
                      </div>
                      {e.title && (
                        <p className="mt-1 truncate text-xs text-[var(--color-fg-muted)]">
                          {e.title}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {e.executions.map((ex, i) => (
                          <span
                            key={i}
                            className="rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] text-[var(--color-fg-muted)]"
                          >
                            {ex.ruleName}
                          </span>
                        ))}
                        {e.actions.map((a, i) => (
                          <ActionPill key={`a${i}`} type={a.type} status={a.status} />
                        ))}
                      </div>
                      {e.errorMessage && e.status === "FAILED" && (
                        <p className="mt-1.5 text-[11px] text-[var(--color-danger)]">
                          {e.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={e.status} />
                      {e.attemptCount > 1 && (
                        <span className="text-[11px] text-[var(--color-warning)]">
                          {e.attemptCount} attempts
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--color-fg-subtle)]">
                        {timeAgo(e.receivedAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4">
              <EmptyState
                icon={<Activity className="size-6" />}
                title="No events"
                description="Events appear here as GitHub delivers webhooks to your connected repositories."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {query.data && query.data.pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-[var(--color-fg-muted)]">
            Page {query.data.pagination.page} of {query.data.pagination.totalPages} ·{" "}
            {query.data.pagination.total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= query.data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
