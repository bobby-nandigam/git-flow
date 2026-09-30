"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Stats, EventsResponse, RepositoryItem } from "@/types/dto";
import { PageHeader, StatTile, ActionPill, eventTitle } from "@/components/dashboard/shared";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { Activity, FolderGit2 } from "lucide-react";

export default function OverviewPage() {
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => apiGet<Stats>("/api/stats"),
    refetchInterval: 8000,
  });
  const events = useQuery({
    queryKey: ["events", "recent"],
    queryFn: () => apiGet<EventsResponse>("/api/events?page=1"),
    refetchInterval: 6000,
  });
  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: () => apiGet<RepositoryItem[]>("/api/repositories"),
  });

  const s = stats.data;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Live view of events, actions and automation health."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.isLoading || !s ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : (
          <>
            <StatTile label="Events" value={s.totalEvents.toLocaleString()} hint={`${s.completedEvents} completed`} />
            <StatTile label="Actions" value={s.totalActions.toLocaleString()} hint={`${s.successActions} succeeded`} />
            <StatTile
              label="Success rate"
              value={`${s.successRate}%`}
              tone={s.successRate >= 95 ? "success" : s.successRate >= 80 ? "warning" : "danger"}
            />
            <StatTile
              label="Retrying"
              value={s.retryingJobs}
              tone={s.retryingJobs > 0 ? "warning" : "default"}
              hint={`${s.failedEvents} failed`}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Link href="/dashboard/events" className="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {events.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : events.data && events.data.events.length > 0 ? (
              <ul className="divide-y divide-[var(--color-border)]">
                {events.data.events.slice(0, 8).map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/dashboard/events/${e.id}`}
                      className="flex items-center gap-3 py-3 transition-colors hover:opacity-80"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--color-fg)]">
                            {eventTitle(e.githubEvent, e.action)}
                          </span>
                          <span className="mono text-xs text-[var(--color-fg-subtle)]">
                            {e.repositoryFullName}
                          </span>
                        </div>
                        {e.title && (
                          <p className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
                            {e.title}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {e.actions.map((a, i) => (
                            <ActionPill key={i} type={a.type} status={a.status} />
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={e.status} />
                        <span className="text-[11px] text-[var(--color-fg-subtle)]">
                          {timeAgo(e.receivedAt)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Activity className="size-6" />}
                title="No events yet"
                description="Connect a repository and open an issue to see automations run in real time."
                action={
                  <Link href="/dashboard/repositories">
                    <Button size="sm">Connect a repository</Button>
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Connected repositories */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Repositories</CardTitle>
            <Link href="/dashboard/repositories" className="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Manage →
            </Link>
          </CardHeader>
          <CardContent>
            {repos.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : repos.data && repos.data.length > 0 ? (
              <ul className="space-y-2">
                {repos.data.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="mono truncate text-xs text-[var(--color-fg)]">
                        {r.fullName}
                      </p>
                      <p className="text-[11px] text-[var(--color-fg-subtle)]">
                        {r._count.rules} rule(s) · {r._count.webhookEvents} events
                      </p>
                    </div>
                    <StatusBadge status={r.webhookStatus} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<FolderGit2 className="size-6" />}
                title="No repositories"
                description="Connect one to get started."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
