import { z } from "zod";
import { requireUserId } from "@/server/auth/session";
import { connectRepository } from "@/server/github/repositories";
import { ok, withErrors, ApiError } from "@/server/http";
import { rateLimit, clientKey } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  return withErrors(async () => {
    const userId = await requireUserId();
    if (!rateLimit(clientKey(req, `connect:${userId}`), 10, 60_000).allowed) {
      throw new ApiError("Too many requests, slow down.", 429);
    }
    const { owner, name } = bodySchema.parse(await req.json());
    const repo = await connectRepository(userId, owner, name);
    return ok({
      id: repo.id,
      fullName: repo.fullName,
      webhookStatus: repo.webhookStatus,
    });
  });
}
