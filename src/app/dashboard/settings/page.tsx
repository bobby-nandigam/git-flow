import { auth } from "@/server/auth";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { CopyField } from "@/components/dashboard/copy-field";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const webhookUrl = `${env.APP_PUBLIC_URL.replace(/\/$/, "")}/api/webhooks/github`;
  const aiConfigured = env.isAiConfigured;

  return (
    <div>
      <PageHeader title="Settings" description="Account, integrations and appearance." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="GitHub user" value={session?.user?.login ?? "—"} />
            <Row label="Name" value={session?.user?.name ?? "—"} />
            <Row label="Email" value={session?.user?.email ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-fg-muted)]">AI triage</span>
              {aiConfigured ? (
                <Badge color="green">{env.AI_PROVIDER} enabled</Badge>
              ) : (
                <Badge color="gray">Not configured</Badge>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-fg-subtle)]">
              AI is optional. When unconfigured, AI actions are marked skipped and
              automations continue normally.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Webhook endpoint</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-[var(--color-fg-muted)]">
              When you connect a repository, this webhook is registered
              automatically with a per-repository signing secret. For manual
              configuration, use this payload URL (content type{" "}
              <span className="mono">application/json</span>) and set the secret to
              your <span className="mono">GITHUB_WEBHOOK_SECRET</span>.
            </p>
            <CopyField value={webhookUrl} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-fg-muted)]">{label}</span>
      <span className="mono text-[var(--color-fg)]">{value}</span>
    </div>
  );
}
