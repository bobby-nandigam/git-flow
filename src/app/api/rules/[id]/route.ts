import { prisma } from "@/server/database/prisma";
import { requireUserId } from "@/server/auth/session";
import { ok, withErrors, ApiError } from "@/server/http";
import { ruleUpdateSchema } from "@/server/automation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertOwnership(userId: string, ruleId: string) {
  const rule = await prisma.automationRule.findUnique({
    where: { id: ruleId },
    select: { userId: true },
  });
  if (!rule || rule.userId !== userId) throw new ApiError("Rule not found", 404);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    await assertOwnership(userId, id);

    const input = ruleUpdateSchema.parse(await req.json());
    const rule = await prisma.automationRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
        ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
        ...(input.actions !== undefined ? { actions: input.actions } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    });
    return ok(rule);
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    await assertOwnership(userId, id);
    await prisma.automationRule.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
