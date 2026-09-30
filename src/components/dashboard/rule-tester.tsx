"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { apiSend } from "@/lib/api";
import type { RuleItem } from "@/types/dto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { X } from "lucide-react";

interface TestResult {
  matched: boolean;
  enabled: boolean;
  eventTypeMatches: boolean;
  conditionResults: {
    condition: { field: string; operator: string; value: string };
    passed: boolean;
  }[];
}

export function RuleTester({ rule, onClose }: { rule: RuleItem; onClose: () => void }) {
  const [title, setTitle] = React.useState("Bug: login fails on mobile");
  const [body, setBody] = React.useState("Steps to reproduce...");
  const [author, setAuthor] = React.useState("");
  const [labels, setLabels] = React.useState("");

  const test = useMutation({
    mutationFn: () =>
      apiSend<TestResult>(`/api/rules/${rule.id}/test`, "POST", {
        title,
        body,
        author,
        labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
      }),
  });

  return (
    <Card className="mb-6 border-[var(--color-border-strong)]">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Test rule: {rule.name}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Sample title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sample author</Label>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Sample body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Sample labels (comma-separated)</Label>
            <Input value={labels} onChange={(e) => setLabels(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? "Evaluating…" : "Run test"}
        </Button>

        {test.data && (
          <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p
              className={`text-sm font-medium ${
                test.data.matched
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]"
              }`}
            >
              {test.data.matched ? "✓ Rule matches" : "✗ Rule does not match"}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {test.data.conditionResults.map((r, i) => (
                <li key={i} className="text-[var(--color-fg-muted)]">
                  <span className={r.passed ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
                    {r.passed ? "✓" : "✗"}
                  </span>{" "}
                  {r.condition.field} {r.condition.operator.replace(/_/g, " ")} “
                  {r.condition.value}”
                </li>
              ))}
              {test.data.conditionResults.length === 0 && (
                <li className="text-[var(--color-fg-subtle)]">No conditions.</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
