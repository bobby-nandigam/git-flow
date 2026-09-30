import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/config";

/**
 * Edge middleware for route protection. Uses the edge-safe base config (no DB),
 * relying on the `authorized` callback to gate /dashboard and private APIs.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
