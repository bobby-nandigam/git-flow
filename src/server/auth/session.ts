import { auth } from "@/server/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolve the current authenticated user id, or throw UnauthorizedError.
 * Used by API route handlers to enforce authentication uniformly.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}
