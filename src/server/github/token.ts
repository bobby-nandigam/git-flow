import { prisma } from "@/server/database/prisma";
import { decryptSecret } from "@/server/security/crypto";

export class GitHubTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubTokenError";
  }
}

/**
 * Fetch and decrypt a user's stored GitHub OAuth token.
 * Throws a clear error (non-retryable) when the user must re-authenticate.
 */
export async function getUserGitHubToken(userId: string): Promise<string> {
  const account = await prisma.gitHubAccount.findUnique({
    where: { userId },
  });
  if (!account) {
    throw new GitHubTokenError(
      "No GitHub token on file — the user must reconnect their GitHub account.",
    );
  }
  try {
    return decryptSecret(account.accessTokenEnc);
  } catch {
    throw new GitHubTokenError("Stored GitHub token could not be decrypted.");
  }
}
