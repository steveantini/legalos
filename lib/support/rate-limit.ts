/**
 * Abuse and cost guardrails for the support assistant (D-160): a per-caller
 * sliding-minute limit, a global daily cap that fails calm ("the assistant
 * is resting"), and the per-message length cap the route enforces via Zod.
 * These ship from day one, while the preview is still owner-only, so the
 * eventual public flip is a flag and not a hardening project.
 *
 * In-memory and PER SERVERLESS INSTANCE, stated honestly: concurrent Vercel
 * instances each carry their own counters, so a determined abuser can get a
 * small multiple of these numbers. That is acceptable for a backstop whose
 * job is to bound cost and absorb accidents; a shared store is the additive
 * next step if public traffic ever warrants it. Caller keys (IP-derived)
 * live only in this process's memory and are never logged or persisted.
 */

export const SUPPORT_MESSAGES_PER_MINUTE = 10;
export const SUPPORT_GLOBAL_MESSAGES_PER_DAY = 1_000;
export const SUPPORT_MESSAGE_MAX_CHARS = 2_000;
/** How many prior turns a request may carry (the context window stays small). */
export const SUPPORT_MAX_HISTORY_MESSAGES = 12;

export type SupportRateVerdict = "ok" | "rate_limited" | "resting";

type Clock = () => number;

/**
 * Pure, clock-injectable limiter so the logic is unit-testable. The route
 * holds one instance per server process.
 */
export function createSupportRateLimiter(now: Clock = Date.now) {
  const perKey = new Map<string, number[]>();
  let dayKey = "";
  let dayCount = 0;

  return {
    check(key: string): SupportRateVerdict {
      const t = now();

      // Global daily cap, UTC-keyed. Resting beats rate_limited: when the
      // day's budget is spent, every caller gets the same calm answer.
      const day = new Date(t).toISOString().slice(0, 10);
      if (day !== dayKey) {
        dayKey = day;
        dayCount = 0;
        perKey.clear(); // also bounds memory across days
      }
      if (dayCount >= SUPPORT_GLOBAL_MESSAGES_PER_DAY) return "resting";

      const cutoff = t - 60_000;
      const recent = (perKey.get(key) ?? []).filter((x) => x > cutoff);
      if (recent.length >= SUPPORT_MESSAGES_PER_MINUTE) {
        perKey.set(key, recent);
        return "rate_limited";
      }

      recent.push(t);
      perKey.set(key, recent);
      dayCount += 1;
      return "ok";
    },
  };
}
