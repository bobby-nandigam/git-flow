/**
 * Best-effort in-memory fixed-window rate limiter.
 *
 * Fluid Compute reuses function instances, so this meaningfully throttles abuse
 * without paid infrastructure. It is intentionally generous for the webhook path
 * (the real webhook defense is HMAC signature verification) so legitimate GitHub
 * traffic is never blocked. For strict cross-instance limits, front the app with
 * Vercel WAF rate rules (documented in the README).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/** Extract a best-effort client key from request headers. */
export function clientKey(req: Request, prefix: string): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || "unknown";
  return `${prefix}:${ip}`;
}
