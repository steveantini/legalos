/**
 * Pure decision logic for the /demo/<token> access path. Kept free of I/O so
 * the time-window validity decision (D-166) and the "always provision into the
 * demo org" guard are unit-testable with plain objects.
 */

/** The invitation row the consume path reads for a token (time-window model). */
export interface DemoInvitationRow {
  id: string;
  organization_id: string;
  /** Stored status: 'active' | 'revoked' (+ legacy 'pending' | 'consumed'). */
  status: string;
  /** ISO timestamp. */
  expires_at: string;
  /** The synthetic user this token already bound, reused across visits. */
  consumed_by_user_id: string | null;
}

export type DemoTokenDecision =
  | { valid: false; reason: "not_found" | "malformed" | "revoked" | "expired" }
  | {
      valid: true;
      invitationId: string;
      organizationId: string;
      /** The user the token already minted (reuse), or null on first visit. */
      existingUserId: string | null;
    };

/**
 * Decide whether a /demo/<token> visit may proceed under the TIME-WINDOW model
 * (D-166). A link is valid REPEATEDLY while `now < expires_at` and it is not
 * revoked — it is no longer consumed on first click. `existingUserId` carries
 * the synthetic user the token already minted (if any) so a returning visitor
 * maps back to the SAME demo user and returns to their own session, rather than
 * getting a fresh user each visit. The route still re-checks `is_demo` before
 * provisioning (buildDemoUserRow throws otherwise), so this decision never
 * lets a sign-in land in the real org.
 */
export function evaluateDemoToken(
  row: DemoInvitationRow | null,
  nowMs: number,
): DemoTokenDecision {
  if (!row) return { valid: false, reason: "not_found" };
  if (!row.id || !row.organization_id) return { valid: false, reason: "malformed" };
  if (row.status === "revoked") return { valid: false, reason: "revoked" };
  if (new Date(row.expires_at).getTime() <= nowMs) {
    return { valid: false, reason: "expired" };
  }
  return {
    valid: true,
    invitationId: row.id,
    organizationId: row.organization_id,
    existingUserId: row.consumed_by_user_id,
  };
}

/**
 * Decide whether a /demo/<token> visit may establish its session, given any
 * EXISTING browser session (D-170). A demo sign-in replaces the single Supabase
 * cookie, so opening a link while signed in silently clobbers that session. This
 * gate stops the silent takeover of a real account: it proceeds only when the
 * visitor is anonymous, has explicitly confirmed, or is already in a demo org;
 * otherwise it routes to a consent interstitial first.
 *
 * `existingOrgIsDemo` is the is_demo flag of the CURRENT session user's org, or
 * null when there is no session / no resolvable org. The conservative default is
 * to ask for consent unless we positively know the visitor is anonymous,
 * confirmed, or already a demo user, so a half-provisioned real session is never
 * clobbered without notice.
 */
export type DemoSessionGuard =
  | { action: "proceed" }
  | { action: "interstitial" };

export function evaluateDemoSessionGuard(input: {
  hasExistingSession: boolean;
  existingOrgIsDemo: boolean | null;
  confirmed: boolean;
}): DemoSessionGuard {
  // Explicit consent (the "Continue to demo" return trip) always proceeds.
  if (input.confirmed) return { action: "proceed" };
  // Anonymous prospect: the normal path, nothing to protect.
  if (!input.hasExistingSession) return { action: "proceed" };
  // Already inside a demo: re-entering/refreshing a demo is harmless.
  if (input.existingOrgIsDemo === true) return { action: "proceed" };
  // A real (or not-yet-resolvable) session: ask before replacing it.
  return { action: "interstitial" };
}

/** Minimal org shape the provisioning guard needs. */
export interface DemoOrgRow {
  id: string;
  is_demo: boolean;
}

/** The public.users row payload for a synthetic demo user. */
export interface DemoUserRow {
  id: string;
  organization_id: string;
  email: string;
  role: "super_admin";
  is_active: true;
}

/**
 * Build the public.users row for a synthetic demo user — ALWAYS as super_admin
 * of the demo org. This is the structural guarantee that a demo sign-in can
 * never land in the real org: it THROWS unless the resolved org is_demo = true,
 * so a non-demo org id can never be provisioned through this path.
 */
export function buildDemoUserRow(
  org: DemoOrgRow,
  authUserId: string,
  email: string,
): DemoUserRow {
  if (org.is_demo !== true) {
    throw new Error(
      "Refusing to provision a demo user: target org is not a demo org (is_demo is not true).",
    );
  }
  return {
    id: authUserId,
    organization_id: org.id,
    email,
    role: "super_admin",
    is_active: true,
  };
}
