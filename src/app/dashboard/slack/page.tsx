"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend, ApiClientError } from "@/lib/api";
import type { RepositoryItem, SlackItem } from "@/types/dto";
import { PageHeader } from "@/components/dashboard/shared";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Slack } from "lucide-react";

export default function SlackPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [url, setUrl] = React.useState("");
  const [repositoryId, setRepositoryId] = React.useState("");

  const integrations = useQuery({
    queryKey: ["slack"],
    queryFn: () => apiGet<SlackItem[]>("/api/slack"),
  });
  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: () => apiGet<RepositoryItem[]>("/api/repositories"),
  });

  const save = useMutation({
    mutationFn: (sendTest: boolean) =>
      apiSend<{ testResult?: { ok: boolean; error?: string } }>(
        "/api/slack",
        "POST",
        {
          webhookUrl: url,
          repositoryId: repositoryId || null,
          sendTest,
        },
      ),
    onSuccess: (data) => {
      if (data.testResult && !data.testResult.ok) {
        toast(`Saved, but test failed: ${data.testResult.error}`, "error");
      } else {
        toast("Slack webhook saved.", "success");
      }
      setUrl("");
      qc.invalidateQueries({ queryKey: ["slack"] });
    },
    onError: (e: ApiClientError) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiSend(`/api/slack?id=${id}`, "DELETE"),
    onSuccess: () => {
      toast("Integration removed.", "success");
      qc.invalidateQueries({ queryKey: ["slack"] });
    },
    onError: (e: ApiClientError) => toast(e.message, "error"),
  });

  const repoName = (id: string | null) =>
    id ? repos.data?.find((r) => r.id === id)?.fullName ?? id : "Account default";

  return (
    <div>
      <PageHeader
        title="Slack"
        description="Send automation notifications to Slack. The webhook URL is encrypted at rest and never exposed."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add / update webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Slack Incoming Webhook URL</Label>
            <Input
              type="password"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select
              value={repositoryId}
              onChange={(e) => setRepositoryId(e.target.value)}
            >
              <option value="">Account default (all repositories)</option>
              {repos.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate(false)} disabled={!url || save.isPending}>
              Save
            </Button>
            <Button
              variant="secondary"
              onClick={() => save.mutate(true)}
              disabled={!url || save.isPending}
            >
              Save &amp; send test
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured integrations</CardTitle>
        </CardHeader>
        <CardContent>
          {integrations.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : integrations.data && integrations.data.length > 0 ? (
            <ul className="space-y-2">
              {integrations.data.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-[var(--color-fg)]">
                      {repoName(i.repositoryId)}
                    </p>
                    <p className="mono text-[11px] text-[var(--color-fg-subtle)]">
                      {i.webhookUrl}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={i.enabled ? "ACTIVE" : "DISABLED"} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[var(--color-danger)]"
                      onClick={() => remove.mutate(i.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Slack className="size-6" />}
              title="No Slack integrations"
              description="Add an Incoming Webhook URL to receive notifications."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
