import { prisma } from "@/server/database/prisma";
import { logger } from "@/server/logger";

/**
 * PostgreSQL-backed job queue — no Redis, no paid infra.
 *
 * Reliability properties:
 *  - Exactly-one job per webhook event (Job.webhookEventId is UNIQUE).
 *  - Concurrency-safe claiming via `FOR UPDATE SKIP LOCKED`, so multiple workers
 *    (e.g. the webhook's waitUntil path + the cron sweep) never double-process.
 *  - Exponential backoff with a bounded attempt count, then a terminal FAILED
 *    (dead-letter) state.
 */

export const MAX_ATTEMPTS = 5;

/**
 * Backoff before the given (1-indexed) attempt runs.
 * attempt 1 -> immediate, 2 -> 5s, 3 -> 30s, 4 -> 2m, 5 -> 5m.
 */
export function backoffMs(attemptNumber: number): number {
  const table = [0, 5_000, 30_000, 120_000, 300_000];
  return table[attemptNumber - 1] ?? 300_000;
}

export interface ClaimedJob {
  id: string;
  webhookEventId: string;
  attempts: number;
  maxAttempts: number;
}

/** Create (or no-op if it already exists) a job for a webhook event. */
export async function enqueueJob(webhookEventId: string): Promise<void> {
  try {
    await prisma.job.create({
      data: { webhookEventId, status: "PENDING", runAt: new Date() },
    });
  } catch (err) {
    // Unique violation => job already enqueued (idempotent). Anything else rethrows.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      logger.debug("job_already_enqueued", { webhookEventId });
      return;
    }
    throw err;
  }
}

/**
 * Atomically claim up to `limit` due jobs, incrementing attempts and locking
 * them. Stale locks (>5m) are reclaimable so a crashed worker can't strand a job.
 */
export async function claimDueJobs(
  workerId: string,
  limit = 5,
): Promise<ClaimedJob[]> {
  const rows = await prisma.$queryRawUnsafe<ClaimedJob[]>(
    `
    UPDATE "jobs"
    SET status = 'PROCESSING'::"JobStatus",
        "lockedAt" = now(),
        "lockedBy" = $1,
        attempts = attempts + 1,
        "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "jobs"
      WHERE status IN ('PENDING'::"JobStatus", 'RETRYING'::"JobStatus")
        AND "runAt" <= now()
        AND ("lockedAt" IS NULL OR "lockedAt" < now() - interval '5 minutes')
      ORDER BY "runAt" ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "webhookEventId", attempts, "maxAttempts";
    `,
    workerId,
    limit,
  );
  return rows;
}

export async function markJobCompleted(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "COMPLETED", lockedAt: null, lockedBy: null, lastError: null },
  });
}

/**
 * Record a failed attempt. Schedules a retry with backoff if attempts remain,
 * otherwise moves the job to the terminal FAILED (dead-letter) state.
 * Returns whether the job will be retried.
 */
export async function markJobFailed(
  job: ClaimedJob,
  error: string,
  opts: { permanent?: boolean } = {},
): Promise<{ retried: boolean }> {
  const shouldRetry = !opts.permanent && job.attempts < job.maxAttempts;

  if (shouldRetry) {
    const runAt = new Date(Date.now() + backoffMs(job.attempts + 1));
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "RETRYING",
        runAt,
        lockedAt: null,
        lockedBy: null,
        lastError: error.slice(0, 500),
      },
    });
    return { retried: true };
  }

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      lockedAt: null,
      lockedBy: null,
      lastError: error.slice(0, 500),
    },
  });
  return { retried: false };
}
