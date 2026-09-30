import { prisma } from "@/server/database/prisma";
import { requireUserId } from "@/server/auth/session";
import { ok, withErrors } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aggregate dashboard stats, scoped to the user's repositories. */
export async function GET() {
  return withErrors(async () => {
    const userId = await requireUserId();
    const repoFilter = { repository: { userId } };

    const [
      totalEvents,
      completedEvents,
      failedEvents,
      totalActions,
      successActions,
      repoCount,
      ruleCount,
      retryingJobs,
    ] = await Promise.all([
      prisma.webhookEvent.count({ where: repoFilter }),
      prisma.webhookEvent.count({ where: { ...repoFilter, status: "COMPLETED" } }),
      prisma.webhookEvent.count({ where: { ...repoFilter, status: "FAILED" } }),
      prisma.actionExecution.count({ where: { webhookEvent: repoFilter } }),
      prisma.actionExecution.count({
        where: { webhookEvent: repoFilter, status: "SUCCESS" },
      }),
      prisma.repository.count({ where: { userId } }),
      prisma.automationRule.count({ where: { userId } }),
      prisma.job.count({
        where: { status: "RETRYING", webhookEvent: repoFilter },
      }),
    ]);

    const processed = completedEvents + failedEvents;
    const successRate =
      processed === 0 ? 100 : Math.round((completedEvents / processed) * 1000) / 10;

    return ok({
      totalEvents,
      completedEvents,
      failedEvents,
      totalActions,
      successActions,
      successRate,
      repoCount,
      ruleCount,
      retryingJobs,
    });
  });
}
