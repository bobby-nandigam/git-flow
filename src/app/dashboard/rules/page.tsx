"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend, ApiClientError } from "@/lib/api";
import type { RepositoryItem, RuleItem } from "@/types/dto";
import { PageHeader } from "@/components/dashboard/shared";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Skeleton, Switch } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  RuleEditor,
  EVENT_TYPES,
  type RuleFormValue,
} from "@/components/dashboard/rule-editor";
import { RuleTester } from "@/components/dashboard/rule-tester";
import { Workflow } from "lucide-react";

const eventLabel = (v: string) => EVENT_TYPES.find((t) => t.value === v)?.label ?? v;

export default function RulesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<RuleItem | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [testing, setTesting] = React.useState<RuleItem | null>(null);

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: () => apiGet<RepositoryItem[]>("/api/repositories"),
  });
  const rules = useQuery({
    queryKey: ["rules"],
    queryFn: () => apiGet<RuleItem[]>("/api/rules"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["rules"] });

  const create = useMutation({
    mutationFn: (v: RuleFormValue) => apiSend("/api/rules", "POST", v),
    onSuccess: () => {
      toast("Rule created.", "success");
      setCreating(false);
      invalidate();
    },
    onError: (e: ApiClientError) => toast(e.message, "error"),
  });

  const update = useMutation({
    mutationFn: ({ id, v }: { id: string; v: RuleFormValue }) =>
      apiSend(`/api/rules/${id}`, "PATCH", v),
    onSuccess: () => {
      toast("Rule updated.", "success");
      setEditing(null);
      invalidate();
    },
    onError: (e: ApiClientError) => toast(e.message, "error"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiSend(`/api/rules/${id}`, "PATCH", { enabled }),
    onSuccess: invalidate,
    onError: (e: ApiClientError) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiSend(`/api/rules/${id}`, "DELETE"),
    onSuccess: () => {
      toast("Rule deleted.", "success");
      invalidate();
    },
    onError: (e: ApiClientError) => toast(e.message, "error"),
  });

  const noRepos = !repos.isLoading && (repos.data?.length ?? 0) === 0;

  return (
    <div>
      <PageHeader
        title="Automation rules"
        description="Rules are data — configure triggers, conditions and actions without changing code."
        action={
          !noRepos && (
            <Button
              onClick={() => {
                setCreating(true);
                setEditing(null);
              }}
              disabled={creating}
            >
              New rule
            </Button>
          )
        }
      />

      {noRepos && (
        <EmptyState
          icon={<Workflow className="size-6" />}
          title="Connect a repository first"
          description="Rules belong to a repository. Connect one to create automations."
        />
      )}

      {creating && repos.data && (
        <RuleEditor
          repositories={repos.data}
          onCancel={() => setCreating(false)}
          onSubmit={(v) => create.mutate(v)}
          submitting={create.isPending}
        />
      )}

      {editing && repos.data && (
        <RuleEditor
          repositories={repos.data}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => update.mutate({ id: editing.id, v })}
          submitting={update.isPending}
        />
      )}

      {testing && (
        <RuleTester rule={testing} onClose={() => setTesting(null)} />
      )}

      {rules.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : rules.data && rules.data.length > 0 ? (
        <div className="space-y-3">
          {rules.data.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-fg)]">
                        {rule.name}
                      </span>
                      <StatusBadge status={rule.enabled ? "ACTIVE" : "DISABLED"} />
                    </div>
                    <p className="mono mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">
                      {rule.repository.fullName} · {eventLabel(rule.eventType)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rule.conditions.map((c, i) => (
                        <span
                          key={i}
                          className="rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] text-[var(--color-fg-muted)]"
                        >
                          {c.field} {c.operator.replace(/_/g, " ")} “{c.value}”
                        </span>
                      ))}
                      {rule.conditions.length === 0 && (
                        <span className="text-[11px] text-[var(--color-fg-subtle)]">
                          no conditions
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {rule.actions.map((a, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-fg-muted)]"
                        >
                          {a.type === "GITHUB_LABEL"
                            ? `label: ${a.label}`
                            : a.type.replace(/_/g, " ").toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={rule.enabled}
                      onChange={(v) => toggle.mutate({ id: rule.id, enabled: v })}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setTesting(rule)}>
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(rule);
                        setCreating(false);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[var(--color-danger)]"
                      onClick={() => {
                        if (confirm(`Delete rule “${rule.name}”?`)) remove.mutate(rule.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">
                  {rule._count.executions} execution(s)
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !noRepos && (
          <EmptyState
            icon={<Workflow className="size-6" />}
            title="No rules yet"
            description="Create your first automation rule to start acting on GitHub events."
            action={<Button onClick={() => setCreating(true)}>New rule</Button>}
          />
        )
      )}
    </div>
  );
}
