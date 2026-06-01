import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Unified People activity log (A6) — read-only viewer over the two trigger-written
 * audit tables the People area accrues:
 *   - role_change_audit (migration 0048): old_role → new_role
 *   - user_status_audit (migration 0049): old_is_active → new_is_active
 *
 * Both share an identical spine (id, organization_id, actor_user_id,
 * target_user_id, created_at) and differ only in their change pair, so they merge
 * cleanly into one chronological feed with a per-row `kind` discriminator.
 *
 * This surfaces ONLY what is already recorded. Other governance actions
 * (Policy & access edits, connection grant/revoke, invitation lifecycle,
 * agent/department changes) are NOT event-logged today and are out of scope —
 * the viewer is framed honestly as people/role/status activity, not a complete
 * audit.
 *
 * Reads are RLS-scoped: `role_change_audit_admin_read` / `user_status_audit_admin_read`
 * admit super/org admins for their own org; an explicit `organization_id` filter
 * mirrors that at the app layer (consistent with insights-math). User ids are
 * resolved to display names via one batched `users` lookup (the established
 * pattern); a null actor/target (a deleted user, or a direct-SQL change with no
 * auth.uid()) renders as a friendly fallback rather than a blank or raw UUID,
 * which also honestly reveals out-of-app changes.
 *
 * V1 PAGINATION: most-recent-N from EACH table (created_at DESC, each backed by
 * its `created_at` index), merged and sorted in JS, with a created_at cursor for
 * load-more. At current volume (single org, near-zero rows) this is correct and
 * cheap. The clean unbounded path is a `UNION ALL` view (or rpc) with a keyset
 * cursor over both tables; a multi-tenant `(organization_id, created_at)`
 * composite index is the matching optimization. Both are noted as future work,
 * deliberately not built here.
 */

export const AUDIT_PAGE_SIZE = 50;

export type OrgRole = "super_admin" | "org_admin" | "user";

/** A resolved actor or target. `id` null → an out-of-app or removed user. */
export type AuditParty = {
  id: string | null;
  name: string;
};

export type AuditEvent =
  | {
      id: string;
      kind: "role_change";
      actor: AuditParty;
      target: AuditParty;
      createdAt: string;
      oldRole: OrgRole;
      newRole: OrgRole;
    }
  | {
      id: string;
      kind: "status_change";
      actor: AuditParty;
      target: AuditParty;
      createdAt: string;
      wasActive: boolean;
      nowActive: boolean;
    };

export type AuditPage = {
  events: AuditEvent[];
  /** Whether older events exist beyond this page (drives load-more). */
  hasMore: boolean;
  /** created_at of the last event on this page; pass back to load the next. */
  nextCursor: string | null;
};

/** Friendly fallbacks for a null actor/target (never a blank or raw UUID). */
const SYSTEM_ACTOR = "The system";
const FORMER_MEMBER = "a former member";

const EMPTY_PAGE: AuditPage = { events: [], hasMore: false, nextCursor: null };

/** Raw normalized row before name resolution. */
type RawEvent = {
  id: string;
  kind: "role_change" | "status_change";
  actorId: string | null;
  targetId: string | null;
  createdAt: string;
  oldRole?: OrgRole;
  newRole?: OrgRole;
  wasActive?: boolean;
  nowActive?: boolean;
};

/**
 * Returns one page of the unified audit feed, newest first. Pass the previous
 * page's `nextCursor` to load older events. Returns an empty page on any failure
 * (the viewer renders a calm zero-state rather than an error).
 */
export async function getAuditLogPage(
  cursor?: string | null,
): Promise<AuditPage> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return EMPTY_PAGE;

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = profile?.organization_id as string | undefined;
    if (!orgId) return EMPTY_PAGE;

    // Most-recent page-worth from each table, older than the cursor if given.
    let roleQuery = supabase
      .from("role_change_audit")
      .select("id, actor_user_id, target_user_id, old_role, new_role, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(AUDIT_PAGE_SIZE);
    let statusQuery = supabase
      .from("user_status_audit")
      .select("id, actor_user_id, target_user_id, old_is_active, new_is_active, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(AUDIT_PAGE_SIZE);
    if (cursor) {
      roleQuery = roleQuery.lt("created_at", cursor);
      statusQuery = statusQuery.lt("created_at", cursor);
    }

    const [roleRes, statusRes] = await Promise.all([roleQuery, statusQuery]);
    if (roleRes.error || statusRes.error) {
      console.error("getAuditLogPage read failed", {
        roleCode: roleRes.error?.code,
        statusCode: statusRes.error?.code,
      });
      return EMPTY_PAGE;
    }

    const roleRows = roleRes.data ?? [];
    const statusRows = statusRes.data ?? [];

    const candidates: RawEvent[] = [
      ...roleRows.map(
        (r): RawEvent => ({
          id: r.id as string,
          kind: "role_change",
          actorId: (r.actor_user_id as string | null) ?? null,
          targetId: (r.target_user_id as string | null) ?? null,
          createdAt: r.created_at as string,
          oldRole: r.old_role as OrgRole,
          newRole: r.new_role as OrgRole,
        }),
      ),
      ...statusRows.map(
        (r): RawEvent => ({
          id: r.id as string,
          kind: "status_change",
          actorId: (r.actor_user_id as string | null) ?? null,
          targetId: (r.target_user_id as string | null) ?? null,
          createdAt: r.created_at as string,
          wasActive: r.old_is_active as boolean,
          nowActive: r.new_is_active as boolean,
        }),
      ),
    ];

    candidates.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const pageRaw = candidates.slice(0, AUDIT_PAGE_SIZE);

    // More exists if we have leftover merged candidates, or if either table
    // filled its limit (so it may have more beyond the fetched window — the
    // created_at cursor re-fetches those on the next page).
    const hasMore =
      candidates.length > AUDIT_PAGE_SIZE ||
      roleRows.length === AUDIT_PAGE_SIZE ||
      statusRows.length === AUDIT_PAGE_SIZE;
    const nextCursor =
      pageRaw.length > 0 ? pageRaw[pageRaw.length - 1].createdAt : null;

    // Batch-resolve the actor + target names for just this page in one query.
    const ids = new Set<string>();
    for (const e of pageRaw) {
      if (e.actorId) ids.add(e.actorId);
      if (e.targetId) ids.add(e.targetId);
    }
    const nameById = new Map<string, string>();
    if (ids.size > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", Array.from(ids));
      for (const u of users ?? []) {
        nameById.set(
          u.id as string,
          ((u.full_name as string | null)?.trim() || (u.email as string)) ??
            FORMER_MEMBER,
        );
      }
    }

    const resolveActor = (id: string | null): AuditParty =>
      id === null
        ? { id: null, name: SYSTEM_ACTOR }
        : { id, name: nameById.get(id) ?? FORMER_MEMBER };
    const resolveTarget = (id: string | null): AuditParty =>
      id === null
        ? { id: null, name: FORMER_MEMBER }
        : { id, name: nameById.get(id) ?? FORMER_MEMBER };

    const events: AuditEvent[] = pageRaw.map((e) => {
      const actor = resolveActor(e.actorId);
      const target = resolveTarget(e.targetId);
      if (e.kind === "role_change") {
        return {
          id: e.id,
          kind: "role_change",
          actor,
          target,
          createdAt: e.createdAt,
          oldRole: e.oldRole!,
          newRole: e.newRole!,
        };
      }
      return {
        id: e.id,
        kind: "status_change",
        actor,
        target,
        createdAt: e.createdAt,
        wasActive: e.wasActive!,
        nowActive: e.nowActive!,
      };
    });

    return { events, hasMore, nextCursor };
  } catch (err) {
    console.error("getAuditLogPage failed", err);
    return EMPTY_PAGE;
  }
}
