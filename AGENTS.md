# AGENTS.md

Project-specific instructions for AI coding agents working in this repository.
Follow these rules; they encode the invariants that keep GitFlow Automator
correct and secure.

## Architecture

- Keep **webhook ingestion separate from automation execution**. The webhook
  route (`src/app/api/webhooks/github/route.ts`) must only verify, persist,
  enqueue, and respond. Never add GitHub/Slack/AI calls inline there.
- Downstream work runs in the **worker** (`src/server/queue/worker.ts` →
  `src/server/automation/processor.ts`). Add new side effects there.
- The **rule engine** (`src/server/automation/rule-engine.ts`) is pure and
  deterministic. Do not put I/O in it. Side effects live in
  `action-executor.ts`.
- Rules are **data**, not code. Add new conditions/actions by extending the Zod
  schemas in `src/server/automation/types.ts` and the executor — never hard-code
  a rule in the handler.

## Security

- **Never** expose secrets to the frontend or return them from an API. Slack
  URLs, GitHub tokens, and webhook secrets are encrypted at rest
  (`src/server/security/crypto.ts`) and must stay server-side.
- **Always** verify `X-Hub-Signature-256` with a timing-safe comparison before
  trusting any webhook payload.
- Every API route must call `requireUserId()` and enforce **ownership** of the
  target resource before reading/mutating it.
- Validate all external input with **Zod**. Never trust repo owner/name, user
  ids, payloads, rule conditions, or AI output without validation.

## Webhooks

- Always verify the signature. Reject missing/invalid signatures and malformed
  payloads.
- Use the untrusted repository name only to *select* a candidate secret;
  verification still proves authenticity.
- Preserve the **raw request body** for HMAC — never re-serialize before
  verifying.

## Idempotency

- Never process a GitHub delivery more than once. `WebhookEvent.githubDeliveryId`
  is `UNIQUE`; rely on it. Duplicate deliveries return `200`.
- Keep executions unique per `(webhookEventId, ruleId)` and skip
  already-succeeded actions on retry.

## Database

- Use **Prisma migrations** (`prisma/migrations`). Never edit the DB shape
  outside a migration. Run `npm run db:migrate` for local changes.
- Access the DB only through the Prisma client (`src/server/database/prisma.ts`).
- Add appropriate `@@index` and foreign-key `onDelete` behavior for new models.

## Testing

- Add tests for security-sensitive functionality (signatures, idempotency,
  authorization, action de-duplication).
- Prefer **pure unit tests**; mock the DB / GitHub client with `vi.hoisted` for
  behavior tests. Tests must not require network or a live database.

## Naming & API Conventions

- API responses use `{ ok: true, data }` or `{ ok: false, error }` via
  `src/server/http.ts`. Wrap handlers in `withErrors`.
- BigInt fields are serialized to strings by `ok()`/`json()`.
- Files: kebab-case; React components: PascalCase; server modules grouped by
  domain under `src/server/<domain>/`.

## Secret handling

- Never commit `.env` / `.env.local`. `.env.example` contains placeholders only.
- Never log secrets — the logger redacts, but don't rely on it: don't pass
  secrets into log metadata in the first place.

## Deployment

- Target Vercel. Cron is defined in `vercel.json`. The webhook and cron routes
  run on the Node.js runtime (`export const runtime = "nodejs"`).
- Do not use `localhost` for OAuth callback, webhook URL, or production API URL.

## Do not modify

- The signature verification logic without a corresponding test proving
  valid/invalid/missing/tampered cases still hold.
- The idempotency constraints (`githubDeliveryId` unique, one job per event)
  without preserving exactly-once processing.
- The secret-encryption format without a migration for existing ciphertext.
```
