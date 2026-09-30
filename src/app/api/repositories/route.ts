import { prisma } from "@/server/database/prisma";
import { requireUserId } from "@/server/auth/session";
import { ok, withErrors } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the current user's connected repositories (never returns secrets). */
export async function GET() {
  return withErrors(async () => {
    const userId = await requireUserId();
    const repos = await prisma.repository.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        owner: true,
        name: true,
        fullName: true,
        private: true,
        webhookStatus: true,
        events: true,
        createdAt: true,
        _count: { select: { webhookEvents: true, rules: true } },
      },
    });
    return ok(repos);
  });
}
