"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend, ApiClientError } from "@/lib/api";
import type { RepositoryItem, AvailableRepo } from "@/types/dto";
import { PageHeader } from "@/components/dashboard/shared";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Skeleton, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/utils";
import { FolderGit2, RefreshCw } from "lucide-react";

export default function RepositoriesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = React.useState("");
  const [showConnect, setShowConnect] = React.useState(false);

  const connected = useQuery({
    queryKey: ["repositories"],
    queryFn: () => apiGet<RepositoryItem[]>("/api/repositories"),
  });

  const available = useQuery({
    queryKey: ["repositories", "available"],
    queryFn: () => apiGet<AvailableRepo[]>("/api/repositories/available"),
    enabled: showConnect,
  });

  const connect = useMutation({
    mutationFn: (r: { owner: string; name: string }) =>
      apiSend("/api/repositories/connect", "POST", r),
    onSuccess: () => {
      toast("Repository connected — webhook registered.", "success");
      qc.invalidateQueries({ queryKey: ["repositories"] });
    },
    onError: (e: ApiClientError) => toast(e.message, "error"),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => apiSend(`/api/repositories/${id}`, "DELETE"),
    onSuccess: () => {
      toast("Repository disconnected.", "success");
      qc.invalidateQueries({ queryKey: ["repositories"] });
    },
    onError: (e: ApiClientError) => toast(e.message, "error"),
  });

  const filtered = available.data?.filter((r) =>
    r.fullName.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Repositories"
        description="Connect repositories you administer. A webhook is registered automatically."
        action={
          <Button onClick={() => setShowConnect((s) => !s)}>
            {showConnect ? "Close" : "Connect repository"}
          </Button>
        }
      />

      {showConnect && (
        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Available repositories</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => available.refetch()}
              title="Refresh"
            >
              <RefreshCw className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Filter by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mb-3"
            />
            {available.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-11" />
                ))}
              </div>
            ) : available.isError ? (
              <p className="text-sm text-[var(--color-danger)]">
                Could not load repositories. Your GitHub token may have expired —
                try signing out and back in.
              </p>
            ) : (
              <ul className="max-h-96 space-y-1.5 overflow-auto">
                {filtered?.map((r) => (
                  <li
                    key={r.githubRepoId}
                    className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="mono truncate text-xs text-[var(--color-fg)]">
                        {r.fullName}
                      </p>
                      <p className="text-[11px] text-[var(--color-fg-subtle)]">
                        {r.private ? "Private" : "Public"}
                      </p>
                    </div>
                    {r.connected ? (
                      <StatusBadge status="CONNECTED" />
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={connect.isPending}
                        onClick={() =>
                          connect.mutate({ owner: r.owner, name: r.name })
                        }
                      >
                        {connect.isPending && connect.variables?.name === r.name ? (
                          <Spinner />
                        ) : (
                          "Connect"
                        )}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {connected.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : connected.data && connected.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {connected.data.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="mono truncate text-sm font-medium text-[var(--color-fg)]">
                      {r.fullName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">
                      Connected {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={r.webhookStatus} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.events.map((e) => (
                    <span
                      key={e}
                      className="mono rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] text-[var(--color-fg-muted)]"
                    >
                      {e}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--color-fg-muted)]">
                    {r._count.rules} rule(s) · {r._count.webhookEvents} events
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-danger)]"
                    disabled={disconnect.isPending}
                    onClick={() => {
                      if (confirm(`Disconnect ${r.fullName}? This removes its webhook.`))
                        disconnect.mutate(r.id);
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
                {r.webhookStatus === "PENDING" && (
                  <p className="mt-2 text-[11px] text-[var(--color-warning)]">
                    A webhook may already exist for this URL. Remove the old hook in
                    GitHub settings, then reconnect.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderGit2 className="size-6" />}
          title="No repositories connected"
          description="Connect a repository you administer to start automating."
          action={<Button onClick={() => setShowConnect(true)}>Connect repository</Button>}
        />
      )}
    </div>
  );
}
