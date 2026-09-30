import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/config";
import { prisma } from "@/server/database/prisma";
import { encryptSecret } from "@/server/security/crypto";
import { logger } from "@/server/logger";

/**
 * Full auth instance (Node runtime). Adds DB-backed callbacks on top of the
 * edge-safe base config. On sign-in we upsert the User and store the GitHub
 * OAuth token encrypted at rest — it is never placed in the JWT/session sent to
 * the browser.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      // Runs on sign-in (account+profile present) and on every subsequent call.
      if (account && profile) {
        const githubId = BigInt(Number(profile.id));
        const login = (profile.login as string) ?? "unknown";
        const user = await prisma.user.upsert({
          where: { githubId },
          create: {
            githubId,
            login,
            name: (profile.name as string) ?? null,
            email: (profile.email as string) ?? null,
            avatarUrl: (profile.avatar_url as string) ?? null,
          },
          update: {
            login,
            name: (profile.name as string) ?? null,
            email: (profile.email as string) ?? null,
            avatarUrl: (profile.avatar_url as string) ?? null,
          },
        });

        if (account.access_token) {
          const enc = encryptSecret(account.access_token);
          await prisma.gitHubAccount.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              accessTokenEnc: enc,
              scope: account.scope ?? null,
              tokenType: account.token_type ?? null,
            },
            update: {
              accessTokenEnc: enc,
              scope: account.scope ?? null,
              tokenType: account.token_type ?? null,
            },
          });
        }

        token.userId = user.id;
        token.login = user.login;
        token.avatarUrl = user.avatarUrl ?? undefined;
        logger.info("auth_signin", { userId: user.id, login: user.login });
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
        session.user.login = token.login as string;
        session.user.image = (token.avatarUrl as string) ?? session.user.image;
      }
      return session;
    },
  },
});
