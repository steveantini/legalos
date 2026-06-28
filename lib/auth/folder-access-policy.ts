/**
 * Pure decision-table MIRROR of the member-self-service folder access rules
 * (Policy & access arc, Phase C1). This is the readable LOGIC SPEC the SQL
 * policies implement, exhaustively unit-tested — it is explicitly NOT the RLS
 * proof. The authoritative proof is the adversarial SQL suite
 * `supabase/tests/phase_c1_member_self_service_rls.sql`, run against a database
 * with the migration applied (a Supabase branch). SQL execution is the
 * authority; this module documents intent and catches logic errors in the design.
 */

export type OrgRole = "super_admin" | "org_admin" | "user";
export type Visibility = "org" | "departments" | "private";

export type Viewer = {
  role: OrgRole;
  userId: string;
  /** The viewer belongs to one of the collection's departments. */
  inDepartments: boolean;
  /** The viewer is in the same organization as the collection. */
  sameOrg: boolean;
};

export type CollectionFacts = {
  visibility: Visibility;
  /** created_by_user_id; null when the owner was deleted (ON DELETE SET NULL). */
  ownerId: string | null;
};

/**
 * Mirrors the `collections` READ policy, including the carve-out that org_admin's
 * breadth EXCLUDES private (private is owner + super_admin only).
 */
export function canReadCollection(v: Viewer, c: CollectionFacts): boolean {
  if (!v.sameOrg) return false;
  if (v.role === "super_admin") return true;
  if (c.visibility === "org") return true;
  if (c.visibility === "departments") {
    return v.role === "org_admin" || v.inDepartments;
  }
  // private: owner only (super_admin already returned true above)
  return c.ownerId !== null && c.ownerId === v.userId;
}

/**
 * Mirrors the WRITE decision: super_admin writes anything in-org; a member writes
 * only their own private collection, and only when the org toggle is on (the
 * collections_member_private_write WITH CHECK confines the result to
 * private + self-owned, so a member can't create an org row or move private->org).
 */
export function canWriteCollection(
  v: Viewer,
  c: CollectionFacts,
  toggleOn: boolean,
): boolean {
  if (!v.sameOrg) return false;
  if (v.role === "super_admin") return true;
  return toggleOn && c.visibility === "private" && c.ownerId === v.userId;
}

/**
 * Mirrors `resolveFolderSetupScope`: the SERVER picks the scope so a member can
 * never obtain org visibility. super_admin -> org; member + toggle -> private +
 * self; otherwise not allowed.
 */
export function resolveFolderSetupScope(
  role: OrgRole,
  userId: string | null,
  toggleOn: boolean,
): { allowed: boolean; visibility: "org" | "private"; ownerUserId: string | null } {
  if (role === "super_admin") {
    return { allowed: true, visibility: "org", ownerUserId: null };
  }
  if (userId && toggleOn) {
    return { allowed: true, visibility: "private", ownerUserId: userId };
  }
  return { allowed: false, visibility: "private", ownerUserId: null };
}

/** Mirrors `member_can_manage_collection` (the SECURITY DEFINER ownership gate). */
export function memberCanManageCollection(
  v: Viewer,
  c: CollectionFacts,
  toggleOn: boolean,
): boolean {
  return (
    v.sameOrg &&
    toggleOn &&
    c.visibility === "private" &&
    c.ownerId === v.userId
  );
}

/**
 * The auto-folder dedup identity. Org auto-folders dedup folder-wide
 * (owner null); private dedup per owner, so two members picking the same drive
 * folder get SEPARATE private collections while the same member re-picking reuses
 * theirs. Mirrors the two partial unique indexes.
 */
export function autoFolderDedupKey(
  connectionId: string,
  rootReference: string,
  ownerUserId: string | null,
): string {
  return ownerUserId === null
    ? `org:${connectionId}:${rootReference}`
    : `private:${connectionId}:${rootReference}:${ownerUserId}`;
}
