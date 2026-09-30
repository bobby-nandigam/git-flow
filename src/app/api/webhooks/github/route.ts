import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/database/prisma";
import { logger, correlationId } from "@/server/logger";
import { decryptSecret } from "@/server/security/crypto";
import { verifyGitHubSignature } from "@/server/webhook/verify";
import { normalizeEvent, sanitizePayload } from "@/server/webhook/normalize";
import { enqueueJob } from "@/server/queue/queue";
import { runWorker } from "@/server/queue/worker";
import { addTimeline } from "@/server/automation/timeline";
import { rateLimit, clientKey } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GitHub webhook ingestion.
 *
 * Responsibilities (and ONLY these — no long downstream chains here):
 *   1. Rate-limit + validate required headers.
 *   2. Cryptographically verify the HMAC signature (timing-safe).
 *   3. Enforce idempotency via UNIQUE(githubDeliveryId).
 *   4. Persist a sanitized event + enqueue a job.
 *   5. Respond fast; processing happens asynchronously (waitUntil + cron).
 */
export async function POST(req: Request) {
  const cid = correlationId();

  // (1) Generous rate limit — the real defense is the HMAC below, so we never
  // want to drop legitimate GitHub traffic.
  const rl = rateLimit(clientKey(req, "webhook"), 600, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  const deliveryId = req.headers.get("x-github-delivery");
  const githubEvent = req.headers.get("x-github-event");
  const signature = req.headers.get("x-hub-signature-256");

  // Signature MUST be present (reject before reading/trusting anything).
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: "missing signature" },
      { status: 401 },
    );
  }
  if (!deliveryId || !githubEvent) {
    return NextResponse.json(
      { ok: false, error: "missing required GitHub headers" },
      { status: 400 },
    );
  }

  // Read the RAW body — required for a correct HMAC.
  const rawBody = await req.text();
  if (rawBody.length > 3_000_000) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "malformed payload" }, { status: 400 });
  }

  // (2) Verify signature. We use the untrusted repository name only to *select*
  // candidate secrets; verification still cryptographically proves authenticity.
  const repo = payload.repository as { full_name?: string } | undefined;
  const fullName = repo?.full_name;

  const candidates = fullName
    ? await prisma.repository.findMany({
        where: { fullName },
        select: { id: true, userId: true, webhookSecretEnc: true },
      })
    : [];

  let matchedRepoId: string | null = null;
  let verified = false;

  for (const c of candidates) {
    if (!c.webhookSecretEnc) continue;
    let secret: string;
    try {
      secret = decryptSecret(c.webhookSecretEnc);
    } catch {
      continue;
    }
    if (verifyGitHubSignature(rawBody, signature, secret)) {
      verified = true;
      matchedRepoId = c.id;
      break;
    }
  }

  // Fallback: global webhook secret (for manually-configured hooks).
  if (!verified) {
    const globalSecret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
    if (globalSecret && verifyGitHubSignature(rawBody, signature, globalSecret)) {
      verified = true;
      matchedRepoId = candidates[0]?.id ?? null;
    }
  }

  if (!verified) {
    logger.warn("webhook_invalid_signature", { cid, deliveryId, githubEvent });
    return NextResponse.json(
      { ok: false, error: "invalid signature" },
      { status: 401 },
    );
  }

  // (3) Idempotency + (4) persist. The UNIQUE constraint on githubDeliveryId is
  // the source of truth: concurrent duplicate deliveries can't both insert.
  const normalized = normalizeEvent(githubEvent, payload);
  const sanitized = sanitizePayload(githubEvent, normalized);

  try {
    const event = await prisma.webhookEvent.create({
      data: {
        githubDeliveryId: deliveryId,
        githubEvent,
        action: normalized.action ?? null,
        repositoryId: matchedRepoId,
        repositoryFullName: fullName ?? null,
        senderLogin: normalized.senderLogin ?? null,
        title: normalized.title ?? null,
        payload: sanitized as Prisma.InputJsonValue,
        status: "RECEIVED",
      },
    });

    await addTimeline(event.id, "webhook_received", "Webhook received");
    await addTimeline(event.id, "event_persisted", "Event persisted");

    await enqueueJob(event.id);

    logger.info("webhook_accepted", {
      cid,
      deliveryId,
      githubEvent,
      action: normalized.action,
      repositoryId: matchedRepoId,
    });

    // (5) Fast async processing — keeps the ack well under 1s. The cron sweep is
    // the safety net for retries / anything missed here.
    waitUntil(runWorker({ max: 3 }).catch((e) => logger.error("worker_bg_error", { message: (e as Error).message })));

    return NextResponse.json(
      { ok: true, status: "accepted", eventId: event.id },
      { status: 202 },
    );
  } catch (err) {
    // Duplicate delivery (unique violation) => already processed/processing.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      logger.info("webhook_duplicate", { cid, deliveryId });
      return NextResponse.json(
        { ok: true, status: "duplicate", deliveryId },
        { status: 200 },
      );
    }
    logger.error("webhook_persist_error", { cid, message: (err as Error).message });
    return NextResponse.json(
      { ok: false, error: "internal error" },
      { status: 500 },
    );
  }
}

/** Simple liveness ping for the webhook endpoint. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "github-webhook" });
}
