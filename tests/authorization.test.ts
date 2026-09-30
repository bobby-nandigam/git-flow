import { describe, it, expect, vi, beforeEach } from "vitest";

const authFn = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => authFn() }));

import { requireUserId, UnauthorizedError, getSessionUser } from "@/server/auth/session";

describe("authentication guard", () => {
  beforeEach(() => authFn.mockReset());

  it("throws UnauthorizedError when there is no session", async () => {
    authFn.mockResolvedValueOnce(null);
    await expect(requireUserId()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws when the session has no user id", async () => {
    authFn.mockResolvedValueOnce({ user: {} });
    await expect(requireUserId()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns the user id for an authenticated session", async () => {
    authFn.mockResolvedValueOnce({ user: { id: "user-123", login: "octo" } });
    await expect(requireUserId()).resolves.toBe("user-123");
  });

  it("getSessionUser returns null when unauthenticated", async () => {
    authFn.mockResolvedValueOnce(null);
    await expect(getSessionUser()).resolves.toBeNull();
  });
});
