import crypto from "node:crypto";

/**
 * Verify a GitHub webhook signature (X-Hub-Signature-256).
 *
 * GitHub signs the raw request body with HMAC-SHA256 using the shared secret and
 * sends "sha256=<hex>". We recompute and compare using a timing-safe equality.
 *
 * IMPORTANT: `rawBody` must be the exact bytes GitHub sent — never a re-serialized
 * JSON object, or the HMAC will not match.
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);

  // timingSafeEqual throws if lengths differ, so guard first (length itself is
  // not secret — the digest length is fixed).
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Map a raw GitHub event + action to our internal RuleEventType, or null. */
export function toRuleEventType(
  githubEvent: string,
  action: string | undefined,
  payload: Record<string, unknown>,
): string | null {
  switch (githubEvent) {
    case "issues":
      if (action === "opened") return "ISSUE_OPENED";
      if (action === "closed") return "ISSUE_CLOSED";
      if (action === "edited") return "ISSUE_EDITED";
      return null;
    case "pull_request": {
      if (action === "opened") return "PR_OPENED";
      if (action === "closed") {
        const pr = payload.pull_request as { merged?: boolean } | undefined;
        return pr?.merged ? "PR_MERGED" : "PR_CLOSED";
      }
      return null;
    }
    case "push":
      return "PUSH";
    default:
      return null;
  }
}
