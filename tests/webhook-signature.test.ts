import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyGitHubSignature, toRuleEventType } from "@/server/webhook/verify";

const SECRET = "test_webhook_secret";

function sign(body: string, secret = SECRET): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("GitHub webhook signature verification", () => {
  const body = JSON.stringify({ action: "opened", hello: "world" });

  it("accepts a valid signature", () => {
    expect(verifyGitHubSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(verifyGitHubSignature(body, sign(body, "wrong-secret"), SECRET)).toBe(
      false,
    );
  });

  it("rejects a missing signature", () => {
    expect(verifyGitHubSignature(body, null, SECRET)).toBe(false);
    expect(verifyGitHubSignature(body, "", SECRET)).toBe(false);
  });

  it("rejects a signature without the sha256= prefix", () => {
    const raw = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyGitHubSignature(body, raw, SECRET)).toBe(false);
  });

  it("rejects when the body is tampered with", () => {
    const sig = sign(body);
    expect(verifyGitHubSignature(body + " ", sig, SECRET)).toBe(false);
  });

  it("rejects when the secret is empty", () => {
    expect(verifyGitHubSignature(body, sign(body), "")).toBe(false);
  });
});

describe("event type mapping", () => {
  it("maps issue opened", () => {
    expect(toRuleEventType("issues", "opened", {})).toBe("ISSUE_OPENED");
  });
  it("maps merged PR vs closed PR", () => {
    expect(
      toRuleEventType("pull_request", "closed", { pull_request: { merged: true } }),
    ).toBe("PR_MERGED");
    expect(
      toRuleEventType("pull_request", "closed", { pull_request: { merged: false } }),
    ).toBe("PR_CLOSED");
  });
  it("maps push", () => {
    expect(toRuleEventType("push", undefined, {})).toBe("PUSH");
  });
  it("returns null for unhandled combinations", () => {
    expect(toRuleEventType("issues", "labeled", {})).toBeNull();
    expect(toRuleEventType("star", "created", {})).toBeNull();
  });
});
