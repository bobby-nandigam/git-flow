import { describe, it, expect } from "vitest";
import { backoffMs, MAX_ATTEMPTS } from "@/server/queue/queue";

describe("exponential backoff schedule", () => {
  it("follows the documented schedule", () => {
    expect(backoffMs(1)).toBe(0); // immediate
    expect(backoffMs(2)).toBe(5_000); // 5s
    expect(backoffMs(3)).toBe(30_000); // 30s
    expect(backoffMs(4)).toBe(120_000); // 2m
    expect(backoffMs(5)).toBe(300_000); // 5m
  });

  it("is monotonically non-decreasing", () => {
    for (let i = 2; i <= MAX_ATTEMPTS; i++) {
      expect(backoffMs(i)).toBeGreaterThanOrEqual(backoffMs(i - 1));
    }
  });

  it("caps beyond the table", () => {
    expect(backoffMs(99)).toBe(300_000);
  });
});
