import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-user rate limit on the chat route. Counts user-role messages the
 * caller has produced in the last minute by joining messages →
 * conversations filtered by conversations.user_id = current user.
 *
 * Why count messages and not chat-route invocations:
 *   - The user-role message INSERT is the canonical "intent to chat" event
 *     and already persists for every successful call.
 *   - Reuses existing tables — no new state, no new index, no new code path
 *     to keep in sync.
 *   - Single source of truth across Vercel function instances. An in-memory
 *     limiter would diverge across concurrent instances and let a determined
 *     user get 2-3× the limit.
 *
 * Why explicit user_id filter even with RLS in place:
 *   - The messages table has TWO SELECT policies — messages_user_via_
 *     conversation (user-owns) AND messages_admin_read (org admin).
 *     An org_admin's count(*) without explicit filtering would include
 *     other users' messages and over-restrict the admin's own quota.
 *     Filtering by conversations.user_id keeps the limit per-actual-user.
 *
 * D-023 sets the Phase 2 limit at 20 messages/user/minute. Phase 7 will
 * replace this with a proper rate-limit service if/when scale warrants;
 * the current implementation is one indexed query per chat call.
 */

export const MESSAGES_PER_MINUTE = 20;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; remainingSeconds: number };

export async function checkChatRateLimit(
  supabase: SupabaseClient,
  userId: string,
): Promise<RateLimitResult> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

  const { count, error } = await supabase
    .from("messages")
    .select("id, conversations!inner(user_id)", {
      count: "exact",
      head: true,
    })
    .eq("role", "user")
    .eq("conversations.user_id", userId)
    .gte("created_at", oneMinuteAgo);

  if (error) {
    // Fail open on rate-limiter infrastructure errors. Better to serve a
    // chat request than to block the user on a transient Supabase blip.
    // Log the Postgres code only (no PII per backend-security.md).
    console.error("checkChatRateLimit failed", { code: error.code });
    return { allowed: true };
  }

  const used = count ?? 0;
  if (used < MESSAGES_PER_MINUTE) {
    return { allowed: true };
  }

  // Coarse retry-after: at worst, the oldest counted message ages out of
  // the window in 60 seconds. A precise value would require an extra
  // query for the oldest matching created_at — not worth it for a
  // best-effort rate limit at this scale.
  return { allowed: false, remainingSeconds: 60 };
}
