import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, generateSecret } from "@/server/security/crypto";
import { triageResultSchema } from "@/server/ai/triage";

describe("secret encryption at rest", () => {
  it("round-trips a value", () => {
    const plain = "gho_exampletoken_1234567890";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces different ciphertext each time (random salt+iv)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("fails to decrypt tampered ciphertext (GCM auth)", () => {
    const enc = encryptSecret("secret");
    const tampered = enc.slice(0, -4) + "AAAA";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("generates hex secrets of expected length", () => {
    expect(generateSecret(16)).toHaveLength(32);
  });
});

describe("AI output validation", () => {
  it("accepts a valid triage object", () => {
    const r = triageResultSchema.safeParse({
      summary: "Login is broken",
      category: "bug",
      priority: "high",
      suggestedLabel: "bug",
      reason: "auth flow fails",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid category/priority", () => {
    const r = triageResultSchema.safeParse({
      summary: "x",
      category: "totally-made-up",
      priority: "urgent",
      suggestedLabel: "bug",
      reason: "y",
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(triageResultSchema.safeParse({ summary: "x" }).success).toBe(false);
  });
});
