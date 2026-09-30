import { prisma } from "@/server/database/prisma";
import { logger, correlationId } from "@/server/logger";
import {
  claimDueJobs,
  markJobCompleted,
  markJobFailed,
  type ClaimedJob,
} from "@/server/queue/queue";
import { processWebhookEvent } from "@/server/automation/processor";
import { RetryableActionError } from "@/server/automation/action-executor";
import { GitHubTokenError } from "@/server/github/token";

/** Classify an error as permanent (no retry) vs. transient (retry with backoff). */
function isPermanent(err: unknown): boolean {
  if (err instanceof GitHubTokenError) return true; // needs user re-auth
  if (err instanceof RetryableActionError) return false;
  // ZodError / TypeError from bad data are permanent.
  const name = (err as { name?: string })?.name ?? "";
  if (name === "ZodError") return true;
  // Default: treat unknown errors as transient (DB blip, network) and retry.
  return false;
}

async function processOne(job: ClaimedJob): Promise<void> {
  const cid = correlationId();
  const start = Date.now();
  try {
    await processWebhookEvent(job.webhookEventId);
    await markJobCompleted(job.id);
    logger.info("job_completed", {
      cid,
      jobId: job.id,
      webhookEventId: job.webhookEventId,
      attempt: job.attempts,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const permanent = isPermanent(err);
    const message = (err as Error).message ?? "unknown error";
    const { retried } = await markJobFailed(job, message, { permanent });

    // Reflect terminal failure on the event so the dashboard shows it.
    if (!retried) {
      await prisma.webhookEvent.update({
        where: { id: job.webhookEventId },
        data: { status: "FAILED", errorMessage: message, processedAt: new Date() },
      });
      await prisma.timelineEntry.create({
        data: {
          webhookEventId: job.webhookEventId,
          kind: "job_failed",
          message: `Processing failed permanently after ${job.attempts} attempt(s): ${message}`,
        },
      });
    }

    logger.error("job_attempt_failed", {
      cid,
      jobId: job.id,
      webhookEventId: job.webhookEventId,
      attempt: job.attempts,
      permanent,
      retried,
    });
  }
}

/**
 * Claim and process due jobs. Used by both the cron sweep and the webhook's
 * waitUntil fast-path. Returns the number of jobs processed.
 */
export async function runWorker(opts: { max?: number } = {}): Promise<number> {
  const workerId = `w_${correlationId()}`;
  const max = opts.max ?? 10;
  let processed = 0;

  while (processed < max) {
    const batch = await claimDueJobs(workerId, Math.min(5, max - processed));
    if (batch.length === 0) break;
    // Sequential to keep memory + rate-limit pressure low on free tiers.
    for (const job of batch) {
      await processOne(job);
      processed++;
    }
  }
  return processed;
}
