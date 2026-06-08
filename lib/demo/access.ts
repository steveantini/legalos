/**
 * Pure decision logic for the /demo/<token> access path (Step 2). Kept free of
 * I/O so the single-use-claim interpretation and the "always provision into the
 * demo org" guard are unit-testable with plain objects.
 */

/** The row shape returned by the atomic token claim (an UPDATE … WHERE
 * status = 'pending' … RETURNING id, organization_id). */
export interface ClaimedTokenRow {
  id: string;
  organization_id: string;
}

export type TokenClaim =
  | { claimed: true; invitationId: string; organizationId: string }
  | { claimed: false };

/**
 * Interpret the result of the ATOMIC claim UPDATE. The claim is a single
 * `update demo_invitations set status='consumed' … where token_hash=$1 and
 * status='pending' returning …` — at most one row can transition pending →
 * consumed, so a race or a replay sees zero rows and is rejected here. Exactly
 * one returned row means this caller won the claim; anything else (0 rows, or a
 * defensive >1) means do NOT proceed (no synthetic user is created).
 */
export function interpretTokenClaim(rows: ClaimedTokenRow[] | null): TokenClaim {
  if (!rows || rows.length !== 1) return { claimed: false };
  const row = rows[0];
  if (!row.id || !row.organization_id) return { claimed: false };
  return { claimed: true, invitationId: row.id, organizationId: row.organization_id };
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
