import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The sign-in access gate (A3c). An email may sign in when ANY of:
 *
 *   1. It already belongs to a `public.users` row (an existing, provisioned
 *      user). This clause is what keeps the owner and every current user
 *      admitted through the cutover from the old env allowlist — they were
 *      never "invited" through the new table but must keep signing in.
 *   2. It has an admissible invitation: a `pending` invite that hasn't expired,
 *      or an already-`accepted` one (so the click-through on an invite the user
 *      is mid-accepting is never rejected).
 *   3. It is in the `ALLOWED_EMAILS` env list — kept only as a transitional
 *      safety hatch (a non-empty list still admits those addresses).
 *
 * Deliberately NOT fail-closed-on-unset: when nothing matches, the email is
 * rejected, but clause 1 guarantees the owner is always admitted, so an empty
 * env var can never lock anyone out. This replaces the old env-only allowlist
 * (the JSDoc there anticipated this DB swap); the function is now async.
 *
 * Reads run through the service-role admin client because the gate fires before
 * the user is authenticated (the login action and the /auth/callback handler),
 * where an RLS-scoped client would see nothing. The lookups are by lowercased
 * email only — no secrets, no tokens. Tolerant of the `invitations` table being
 * absent (pre-migration): a failed invite lookup is treated as "no invite", so
 * deploying before the migration is applied still admits existing users.
 *
 * Server-only: importing the admin client makes this a build error if ever
 * pulled into a client bundle. The user-facing rejection copy lives in the login
 * form (a client component), not here, so this module stays server-only.
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return false;

  // Clause 3 — env safety hatch (checked first; no DB round-trip when it hits).
  const raw = process.env.ALLOWED_EMAILS;
  if (raw && raw.trim() !== "") {
    const allowed = raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    if (allowed.includes(normalized)) return true;
  }

  const supabase = createSupabaseAdminClient();

  // Clause 1 — existing user (owner / already-provisioned). Always admitted.
  try {
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .ilike("email", normalized)
      .limit(1)
      .maybeSingle();
    if (existingUser) return true;
  } catch {
    // A users-table read failure should not strand sign-in; fall through.
  }

  // Clause 2 — admissible invitation (pending-not-expired, or accepted).
  try {
    const { data: invites } = await supabase
      .from("invitations")
      .select("status, expires_at")
      .ilike("email", normalized)
      .in("status", ["pending", "accepted"]);
    if (invites && invites.length > 0) {
      const now = Date.now();
      const admissible = invites.some((inv) => {
        if (inv.status === "accepted") return true;
        // pending: only while not expired
        const expiresAt = inv.expires_at ? new Date(inv.expires_at).getTime() : 0;
        return expiresAt > now;
      });
      if (admissible) return true;
    }
  } catch {
    // The invitations table may not exist yet (pre-migration). Treat as no
    // invite — existing users were already admitted above.
  }

  return false;
}
