import { prisma } from "@/server/database/prisma";
import { env } from "@/lib/env";
import { logger } from "@/server/logger";
import { encryptSecret, generateSecret } from "@/server/security/crypto";
import { getUserGitHubToken } from "@/server/github/token";
import {
  getRepo,
  createRepoWebhook,
  deleteRepoWebhook,
  GitHubError,
} from "@/server/github/client";
import { ApiError } from "@/server/http";

const WEBHOOK_EVENTS = ["issues", "pull_request", "push"];

function webhookUrl(): string {
  const base = env.APP_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/api/webhooks/github`;
}

/**
 * Connect a repository: verify the user administers it, then register a webhook
 * with a per-repo signing secret. Authorization is enforced against live GitHub
 * permissions, not just client-supplied data.
 */
export async function connectRepository(
  userId: string,
  owner: string,
  name: string,
) {
  const token = await getUserGitHubToken(userId);

  const repo = await getRepo(token, owner, name);
  if (!repo.permissions?.admin) {
    throw new ApiError(
      "You must have admin permission on this repository to connect it.",
      403,
    );
  }

  const secret = generateSecret(32);
  const secretEnc = encryptSecret(secret);

  let webhookId: bigint | null = null;
  let status: "ACTIVE" | "ERROR" | "PENDING" = "PENDING";

  try {
    const hook = await createRepoWebhook(token, owner, name, {
      url: webhookUrl(),
      secret,
      events: WEBHOOK_EVENTS,
    });
    webhookId = BigInt(hook.id);
    status = "ACTIVE";
  } catch (err) {
    if (err instanceof GitHubError && err.status === 422) {
      // A webhook to this URL likely already exists. Store repo as PENDING and
      // surface guidance rather than failing the whole connection.
      status = "PENDING";
      logger.warn("webhook_exists", { owner, name });
    } else {
      throw err;
    }
  }

  const record = await prisma.repository.upsert({
    where: {
      userId_githubRepoId: { userId, githubRepoId: BigInt(repo.id) },
    },
    create: {
      userId,
      githubRepoId: BigInt(repo.id),
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      webhookId,
      webhookSecretEnc: secretEnc,
      webhookStatus: status,
      events: WEBHOOK_EVENTS,
    },
    update: {
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      webhookId: webhookId ?? undefined,
      webhookSecretEnc: secretEnc,
      webhookStatus: status,
      events: WEBHOOK_EVENTS,
    },
  });

  logger.info("repository_connected", {
    userId,
    repositoryId: record.id,
    fullName: record.fullName,
    webhookStatus: status,
  });

  return record;
}

/** Disconnect a repository (ownership-checked) and remove its GitHub webhook. */
export async function disconnectRepository(userId: string, repositoryId: string) {
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
  });
  if (!repo || repo.userId !== userId) {
    throw new ApiError("Repository not found", 404);
  }

  if (repo.webhookId) {
    try {
      const token = await getUserGitHubToken(userId);
      await deleteRepoWebhook(
        token,
        repo.owner,
        repo.name,
        Number(repo.webhookId),
      );
    } catch (err) {
      // Best-effort: the hook may already be gone. Log and continue.
      logger.warn("webhook_delete_failed", {
        repositoryId,
        message: (err as Error).message,
      });
    }
  }

  await prisma.repository.delete({ where: { id: repositoryId } });
  logger.info("repository_disconnected", { userId, repositoryId });
}
