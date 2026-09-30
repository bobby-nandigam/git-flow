import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Edge-safe base auth config (NO database imports).
 *
 * This is used both by the full Node auth instance and by the edge middleware.
 * Keeping Prisma out of here means middleware can run on the edge runtime
 * without bundling the database client.
 *
 * Requested scopes are the minimum needed to (a) read the user's identity,
 * (b) manage repository webhooks, and (c) add labels / comment on issues & PRs.
 *   - read:user        -> profile
 *   - repo             -> read/write issues+PRs, and webhooks on private repos
 *   - admin:repo_hook  -> create/delete repository webhooks
 */
export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: { scope: "read:user user:email repo admin:repo_hook" },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    /** Route protection used by middleware: dashboard requires a session. */
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      const isProtected =
        pathname.startsWith("/dashboard") ||
        (pathname.startsWith("/api") &&
          !pathname.startsWith("/api/auth") &&
          !pathname.startsWith("/api/webhooks") &&
          !pathname.startsWith("/api/health") &&
          !pathname.startsWith("/api/cron"));
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
