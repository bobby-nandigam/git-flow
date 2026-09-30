import { requireUserId } from "@/server/auth/session";
import { getUserGitHubToken } from "@/server/github/token";
import { listAdminRepos } from "@/server/github/client";
import { prisma } from "@/server/database/prisma";
import { ok, withErrors } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List repos the user can administer on GitHub, flagged if already connected. */
export async function GET() {
  return withErrors(async () => {
    const userId = await requireUserId();
    const token = await getUserGitHubToken(userId);
    const [repos, connected] = await Promise.all([
      listAdminRepos(token),
      prisma.repository.findMany({
        where: { userId },
        select: { githubRepoId: true },
      }),
    ]);
    const connectedIds = new Set(connected.map((c) => c.githubRepoId.toString()));

    return ok(
      repos.map((r) => ({
        githubRepoId: r.id,
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        connected: connectedIds.has(r.id.toString()),
      })),
    );
  });
}
