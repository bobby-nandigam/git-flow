import { requireUserId } from "@/server/auth/session";
import { disconnectRepository } from "@/server/github/repositories";
import { ok, withErrors } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    await disconnectRepository(userId, id);
    return ok({ disconnected: true });
  });
}
