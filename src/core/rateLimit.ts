/**
 * WebWaka — Edge-compatible sliding-window rate limiter
 * Works in Cloudflare Workers (no Node.js built-ins required).
 *
 * Uses an in-memory Map per Worker isolate.  Counters reset if the
 * isolate is recycled, which is acceptable for webhook-spam prevention.
 *
 * Usage:
 *   if (!checkRateLimit(ip, 60, 60_000)) return c.json({ error: "Too many requests" }, 429);
 */

const buckets = new Map<string, number[]>();

/**
 * Returns true  if the caller is within the allowed rate.
 * Returns false if the limit has been exceeded (caller should return 429).
 *
 * @param key       Unique key for the bucket (e.g. IP address, "ip:endpoint")
 * @param maxHits   Maximum allowed requests in the window
 * @param windowMs  Sliding window size in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxHits: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  let hits = buckets.get(key) ?? [];

  // Drop timestamps outside the window
  hits = hits.filter((t) => t > cutoff);

  if (hits.length >= maxHits) {
    buckets.set(key, hits);
    return false;
  }

  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/**
 * Extract the best available IP address from a Cloudflare Workers request.
 * Falls back to a constant string when running locally.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
