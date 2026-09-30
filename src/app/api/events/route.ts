import { prisma } from "@/server/database/prisma";
import { requireUserId } from "@/server/auth/session";
import { ok, withErrors } from "@/server/http";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** Paginated event feed, scoped to the user's repositories. */
export async function GET(req: Request) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const repositoryId = url.searchParams.get("repositoryId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const where: Prisma.WebhookEventWhereInput = {
      repository: { userId },
      ...(repositoryId ? { repositoryId } : {}),
      ...(status ? { status: status as never } : {}),
    };

    const [total, events] = await Promise.all([
      prisma.webhookEvent.count({ where }),
      prisma.webhookEvent.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          githubEvent: true,
          action: true,
          repositoryFullName: true,
          senderLogin: true,
          title: true,
          status: true,
          attemptCount: true,
          receivedAt: true,
          processedAt: true,
          errorMessage: true,
          _count: { select: { executions: true, actions: true } },
          executions: {
            select: { ruleName: true, status: true },
          },
          actions: {
            select: { type: true, status: true },
          },
        },
      }),
    ]);

    return ok({
      events,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    });
  });
}
