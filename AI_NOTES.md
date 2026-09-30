# AI_NOTES.md

An honest account of how AI was used to build GitFlow Automator.

## AI tools used

- **Claude (Anthropic)** running in an agentic coding harness — used for the bulk
  of scaffolding, boilerplate, and first-draft implementations across the stack.

No other assistants (Copilot/Cursor/GPT) were used for this build.

## How work was divided

**AI-generated (then reviewed):**

- Project scaffolding: `package.json`, TypeScript/ESLint/Tailwind/Prisma config.
- The Prisma schema first draft and most CRUD API route handlers.
- UI components and dashboard pages (layout, events, rules, repositories, Slack).
- The bulk of the README and this file's structure.
- The Vitest test cases once the pure modules were designed.

**Human-designed / decided (the load-bearing choices):**

- The **processing architecture**: separating webhook ingestion from execution,
  using `waitUntil` for the fast path plus a Postgres job queue with
  `FOR UPDATE SKIP LOCKED` for concurrency-safe claiming.
- The **idempotency + retry model** and how retries avoid duplicating side
  effects (execution uniqueness + skip-already-succeeded).
- **Per-repo webhook secrets** with the "select candidate secret by untrusted
  repo name, then cryptographically verify" pattern.
- **Encrypting secrets at rest** (AES-256-GCM keyed from `AUTH_SECRET`).
- Debugging the integration seams (Prisma JSON input types, NextAuth v5 edge/node
  split, BigInt serialization) — these needed hands-on iteration.

## Decisions made by the developer (and why)

1. **PostgreSQL-backed job queue instead of Redis/paid queues.** The assignment
   mandates free infrastructure with no credit card. A `jobs` table with
   `FOR UPDATE SKIP LOCKED` claiming gives at-least-once processing, safe
   concurrency, and visible state — with zero extra services. `waitUntil`
   handles the immediate path; Vercel Cron is the retry safety net.

2. **Delivery-ID uniqueness as the idempotency key.** Rather than app-level
   "have I seen this?" checks (racy under concurrency), the database enforces
   `UNIQUE(githubDeliveryId)`. Two simultaneous duplicate deliveries can't both
   insert — the loser is treated as a duplicate and returns `200`. Correctness
   is guaranteed by the DB, not by timing.

3. **A dedicated rule engine separate from the webhook handler.** The webhook
   route stays tiny and fast; rule evaluation is pure and unit-testable; action
   execution is isolated and records every outcome. This keeps the hot path
   under ~1s and makes the system maintainable and observable.

## Hardest AI mistake

**Problem:** The first implementation the AI proposed ran the whole chain —
GitHub label write, Slack POST, and the AI call — **synchronously inside the
webhook request**, then returned `200`.

**Why it was wrong:** GitHub expects a fast webhook ack. A slow Slack/AI/GitHub
call (or a downstream 5xx) would push the response past GitHub's timeout. GitHub
then **redelivers** the same event — and because the original request was still
mid-chain, the same automation could run twice (duplicate labels, duplicate
Slack messages). It also made retries impossible: a failure meant the whole
event was lost.

**How I noticed:** while reasoning about the idempotency requirement and the
"< 1s ack" performance target together — the synchronous design directly
contradicts both. It became obvious that "verify + persist + respond fast" and
"do the work" must be two phases.

**Fix:** Split the pipeline. The webhook route now only verifies, persists (with
the unique delivery id), enqueues a job, and responds `202` immediately. The
actual work runs in a worker invoked via `waitUntil` and a cron sweep, with
retries and backoff. Executions are unique per `(event, rule)` and
already-succeeded actions are skipped on retry, so even redeliveries and job
retries never double-apply a side effect.

**Lesson:** For webhook-driven systems, treat the ingress as a *durable inbox*,
not a place to do work. Persist first, acknowledge fast, process asynchronously —
and make every side effect idempotent, because at-least-once delivery is a
guarantee you will actually hit.

## What I'd improve

- Migrate from broad OAuth scopes to a **GitHub App** (JWT + short-lived
  installation tokens, least-privilege permissions).
- Distributed workers and a first-class **dead-letter queue** UI.
- A **replay window** check (reject deliveries older than N minutes).
- A richer rule DSL (OR groups, regex, numeric operators) and an **audit log**.
- Per-rule metrics/SLOs and more notification integrations.
```
