import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { Logo } from "@/components/brand";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    title: "Cryptographic webhook security",
    body: "Every delivery is verified with HMAC-SHA256 (X-Hub-Signature-256) using a timing-safe comparison before a single byte is trusted.",
  },
  {
    title: "Exactly-once processing",
    body: "GitHub delivery IDs are enforced UNIQUE at the database level, so duplicate and concurrent deliveries never run twice.",
  },
  {
    title: "Durable job queue",
    body: "A Postgres-backed queue with exponential backoff retries downstream failures and dead-letters what it can't recover — no Redis required.",
  },
  {
    title: "Configurable rule engine",
    body: "Match on event type, title, body, author or labels. Add labels, comment, notify Slack and run AI triage — all without touching code.",
  },
  {
    title: "AI triage",
    body: "Optional Gemini/Groq summarization returns validated JSON: summary, category, priority and a suggested label.",
  },
  {
    title: "Live operations dashboard",
    body: "Watch events, matched rules, actions, retries and failures stream in — with a full execution timeline per event.",
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="py-16 sm:py-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-fg-muted)]">
              <span className="size-1.5 rounded-full bg-[var(--color-primary)]" />
              Event-driven GitHub automation
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-[var(--color-fg)] sm:text-5xl">
              Automate your repositories the moment things happen.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-[var(--color-fg-muted)]">
              GitFlow Automator receives verified GitHub webhooks, evaluates rules
              you configure, and takes real action — labeling issues, commenting,
              notifying Slack and running AI triage — while a live dashboard
              records every execution, retry and failure.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <SignInButton size="lg" />
              <a
                href="#features"
                className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              >
                See how it works →
              </a>
            </div>
          </div>
        </section>

        <section id="features" className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <h3 className="text-sm font-semibold text-[var(--color-fg)]">
                {f.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-fg-muted)]">
                {f.body}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-xs text-[var(--color-fg-subtle)]">
          <Logo />
          <span>Built as a production-minded automation product.</span>
        </div>
      </footer>
    </div>
  );
}
