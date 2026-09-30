import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB so we can drive the unique-constraint (P2002) behavior.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/server/database/prisma", () => ({
  prisma: { job: { create } },
}));

import { enqueueJob } from "@/server/queue/queue";

describe("job enqueue idempotency", () => {
  beforeEach(() => create.mockReset());

  it("creates a job on first enqueue", async () => {
    create.mockResolvedValueOnce({ id: "j1" });
    await enqueueJob("event-1");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("silently no-ops on a duplicate (unique violation P2002)", async () => {
    create.mockRejectedValueOnce({ code: "P2002" });
    // Must NOT throw — the delivery was already enqueued.
    await expect(enqueueJob("event-1")).resolves.toBeUndefined();
  });

  it("rethrows unexpected errors", async () => {
    create.mockRejectedValueOnce(new Error("db down"));
    await expect(enqueueJob("event-1")).rejects.toThrow("db down");
  });
});
