/**
 * Defense-in-depth rate limiting for the /demo/<token> endpoint.
 *
 * The PRIMARY protection against brute-forcing a demo link is the token itself:
 * 32 bytes (256 bits) of entropy, single-use, stored only as a hash. That space
 * is infeasible to guess. This limiter is a cheap second layer that caps repeat
 * hits from one client so the endpoint can't be hammered.
 *
 * It is intentionally in-memory and per-instance (no new table, no IP
 * persistence — IPs are PII we don't want to store). Across serverless
 * instances the cap is therefore approximate, which is acceptable precisely
 * because the token entropy, not this counter, is the real guard. The window
 * core is pure so it is unit-testable.
 */

/** D-049 guideline: ~10 attempts per IP per hour. */
export const DEMO_RATE_LIMIT = 10;
export const DEMO_RATE_WINDOW_MS = 60 * 60 * 1000;

/** Keep only timestamps still inside the window. */
export function pruneWindow(
  timestamps: number[],
  now: number,
  windowMs: number,
): number[] {
  return timestamps.filter((t) => now - t < windowMs);
}

/**
 * Pure sliding-window decision: given the prior hit timestamps for a key,
 * return whether this hit is allowed and the next timestamp list to store.
 */
export function allowRequest(
  timestamps: number[],
  now: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; next: number[] } {
  const recent = pruneWindow(timestamps, now, windowMs);
  if (recent.length >= limit) return { allowed: false, next: recent };
  return { allowed: true, next: [...recent, now] };
}

const buckets = new Map<string, number[]>();

/**
 * Record a hit for `key` (a hashed client identifier) and report whether it is
 * within the limit. Module-scoped Map; best-effort per instance.
 */
export function rateLimitDemoAccess(
  key: string,
  now: number = Date.now(),
  limit: number = DEMO_RATE_LIMIT,
  windowMs: number = DEMO_RATE_WINDOW_MS,
): boolean {
  const { allowed, next } = allowRequest(buckets.get(key) ?? [], now, limit, windowMs);
  buckets.set(key, next);
  return allowed;
}
