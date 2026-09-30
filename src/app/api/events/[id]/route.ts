import { prisma } from "@/server/database/prisma";
import { requireUserId } from "@/server/auth/session";
import { ok, withErrors, ApiError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full event detail with executions, actions, AI results and timeline. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const { id } = await params;

    const event = await prisma.webhookEvent.findUnique({
      where: { id },
      include: {
        repository: { select: { userId: true, fullName: true } },
        executions: {
          include: {
            actions: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                type: true,
                status: true,
                detail: true,
                result: true,
                error: true,
                startedAt: true,
                finishedAt: true,
              },
            },
            aiResult: true,
          },
        },
        actions: {
          orderBy: { createdAt: "asc" },
          select: { id: true, type: true, status: true, error: true },
        },
        aiResults: true,
        timeline: { orderBy: { at: "asc" } },
      },
    });

    // Authorization: the event must belong to one of the user's repositories.
    if (!event || event.repository?.userId !== userId) {
      throw new ApiError("Event not found", 404);
    }

    return ok(event);
  });
}
