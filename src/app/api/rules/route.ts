import { prisma } from "@/server/database/prisma";
import { requireUserId } from "@/server/auth/session";
import { ok, withErrors, ApiError } from "@/server/http";
import { ruleInputSchema } from "@/server/automation/types";
import { rateLimit, clientKey } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List rules for the user (optionally filtered by repository). */
export async function GET(req: Request) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const repositoryId =
      new URL(req.url).searchParams.get("repositoryId") ?? undefined;
    const rules = await prisma.automationRule.findMany({
      where: { userId, ...(repositoryId ? { repositoryId } : {}) },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        repository: { select: { fullName: true } },
        _count: { select: { executions: true } },
      },
    });
    return ok(rules);
  });
}

/** Create a rule. Verifies the target repository belongs to the user. */
export async function POST(req: Request) {
  return withErrors(async () => {
    const userId = await requireUserId();
    if (!rateLimit(clientKey(req, `rules:${userId}`), 30, 60_000).allowed) {
      throw new ApiError("Too many requests, slow down.", 429);
    }
    const input = ruleInputSchema.parse(await req.json());

    const repo = await prisma.repository.findUnique({
      where: { id: input.repositoryId },
      select: { userId: true },
    });
    if (!repo || repo.userId !== userId) {
      throw new ApiError("Repository not found", 404);
    }

    const rule = await prisma.automationRule.create({
      data: {
        userId,
        repositoryId: input.repositoryId,
        name: input.name,
        enabled: input.enabled,
        eventType: input.eventType,
        conditions: input.conditions,
        actions: input.actions,
        priority: input.priority,
      },
    });
    return ok(rule);
  });
}
