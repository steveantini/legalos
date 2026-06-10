import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import {
  groupAgentsBySource,
  type ExternalAgentGroup,
} from "@/lib/agents/source";
import {
  getVendorContentSettings,
  vendorContentEnabledFromSettings,
} from "@/lib/content/content-settings";
import { VENDOR_PROVIDER_ORDER } from "@/lib/content/vendor-registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side authorization helpers.
 *
 * RLS at the DB layer is the last-line enforcement. These helpers are the
 * application-layer complement — one call each for the common checks that
 * belong in server components and server actions. All are RLS-scoped (they
 * use the per-request Supabase client carrying the user's JWT); none use
 * the service role.
 */

/**
 * Returns the current Supabase auth user, or redirects to /login if no
 * session exists. The proxy (`proxy.ts`) already gates protected routes;
 * calling this at the top of a server component is defense in depth.
 *
 * Wrapped in React's `cache()` so multiple call sites within the same
 * request (e.g., a layout + its child page) resolve to the same auth
 * lookup. Per-request memoization only — does not leak across requests.
 */
/**
 * The current auth user, or null. The single `supabase.auth.getUser()` round-trip
 * shared by every auth helper in this module (perf item 16): each helper calls
 * this rather than its own getUser(), so a request that runs several helpers (the
 * workspace layout runs four) hits the auth server ONCE instead of once per
 * helper.
 *
 * Wrapped in React's `cache()`, which is REQUEST-SCOPED in the server-render
 * context: the memo lives only for the current request and is never shared across
 * requests, so one request's user can never leak into another's. The user is
 * derived from the request's own cookies via createSupabaseServerClient.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const requireAuthUser = cache(async () => {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});

/**
 * Returns the `public.users` profile for the current auth user, or null
 * if the user is unauthenticated or not yet provisioned (proxy race,
 * or the organization row doesn't exist yet).
 *
 * Wrapped in React's `cache()` for per-request memoization (see
 * `requireAuthUser` above).
 */
export const getCurrentUserProfile = cache(async () => {
  const authUser = await getAuthUser();

  if (!authUser) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select(
      "id, email, full_name, role, organization_id, is_active, welcomed_at",
    )
    .eq("id", authUser.id)
    .maybeSingle();

  return data;
});

/**
 * Subset of `public.departments` columns the launchpad UI needs. Base
 * shape — see `DepartmentWithAccess` below for the access-aware variant
 * returned by `getAllDepartmentsWithAccess` (Session 29).
 */
export interface AccessibleDepartment {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

/**
 * Access-aware variant — every department in the user's org, with a
 * `hasAccess` flag derived from `user_department_roles`. Used by the
 * workspace landing grid and the rail (Session 29) so both surfaces
 * can show every department in the org while visually gating the ones
 * the user can't enter (locked-but-visible UX, mirroring Notion /
 * Linear / Slack convention).
 *
 * Extends `AccessibleDepartment` so consumers that only need the base
 * shape (workspace top bar lookup, breadcrumb dept-name resolution)
 * can continue to type their props as `AccessibleDepartment[]` and
 * accept a `DepartmentWithAccess[]` argument via structural assignment.
 */
export interface DepartmentWithAccess extends AccessibleDepartment {
  hasAccess: boolean;
}

/**
 * Returns the departments the current user has at least one role in,
 * ordered by `sort_order` ascending.
 *
 * As of Session 29 the workspace landing and rail no longer call this
 * helper — they use `getAllDepartmentsWithAccess` below to surface
 * locked departments alongside accessible ones. Retained for any future
 * caller that needs the strict "what can the user enter" set (e.g.,
 * server-side access decisions outside RLS) and as the simpler shape
 * for one-off scripts.
 *
 * Wrapped in React's `cache()` for per-request memoization keyed by
 * `userId`.
 */
export const getAccessibleDepartments = cache(
  async (userId: string): Promise<AccessibleDepartment[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("user_department_roles")
      .select(
        "departments!inner(id, slug, name, description, sort_order)",
      )
      .eq("user_id", userId);

    const departments = (data ?? [])
      .map(
        (row) =>
          (row as unknown as { departments: AccessibleDepartment }).departments,
      )
      .filter((d): d is AccessibleDepartment => Boolean(d));

    departments.sort((a, b) => a.sort_order - b.sort_order);
    return departments;
  },
);

/**
 * Returns every department in the user's org plus a `hasAccess` flag
 * per row. Powers the workspace landing grid and the rail (Session 29)
 * so locked departments render in their muted variant alongside
 * accessible ones.
 *
 * After migration 0020 the `departments_read_same_org` RLS policy
 * admits every org member to read every department row; this helper
 * does two parallel RLS-scoped reads (full dept list, caller's role
 * rows) and joins in JS. Sort is server-side via `order by sort_order`.
 *
 * Wrapped in `cache()` keyed by `userId` so the layout + page calls
 * dedupe to a single round-trip per request.
 */
export const getAllDepartmentsWithAccess = cache(
  async (userId: string): Promise<DepartmentWithAccess[]> => {
    const supabase = await createSupabaseServerClient();

    const [departmentsResult, rolesResult] = await Promise.all([
      supabase
        .from("departments")
        // Soft-deleted departments (migration 0043) never surface in the
        // product. Filtered here so the rail, breadcrumb, and top-bar
        // department list show only active departments.
        .select("id, slug, name, description, sort_order")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("user_department_roles")
        .select("department_id")
        .eq("user_id", userId),
    ]);

    const accessibleIds = new Set(
      (rolesResult.data ?? []).map((r) => r.department_id as string),
    );

    return (departmentsResult.data ?? []).map((d) => ({
      id: d.id as string,
      slug: d.slug as string,
      name: d.name as string,
      description: d.description as string | null,
      sort_order: d.sort_order as number,
      hasAccess: accessibleIds.has(d.id as string),
    }));
  },
);

/**
 * Returns active, non-deleted agent counts per department, keyed by
 * department UUID. RLS scopes the underlying `agents` read to rows the
 * current user can see; `is_active = true` and `deleted_at IS NULL`
 * layer on top of RLS so soft-deleted and deactivated agents don't
 * inflate the count.
 *
 * Used by the Workspace landing (Session 9e) to render "{N} agents"
 * in each department card's foot. Templates and user-owned agents both
 * count — the foot shows total available.
 *
 * One round-trip: returns ~50–100 department_id rows for the current
 * setup (8 departments × ~1–8 agents each), aggregated in JS.
 */
export async function getAgentCountsByDepartment(): Promise<
  Record<string, number>
> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("agents")
    .select("department_id")
    .eq("is_active", true)
    .is("deleted_at", null);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.department_id] = (counts[row.department_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Unified agent shape returned by `getAgent`. Carries every column the
 * chat surface, edit form, and breadcrumb collectively need — the chat
 * page narrows further via its `notFound()` clause (`type='native' &&
 * is_active`); the edit page narrows further (owner + non-template +
 * non-deleted + has-prompt-and-model). The helper itself stays general
 * with a single null contract on any failure mode (missing, RLS-hidden).
 */
export type AccessibleAgent = {
  id: string;
  name: string;
  description: string | null;
  type: "external" | "native";
  is_active: boolean;
  is_template: boolean;
  system_prompt: string | null;
  model: string | null;
  tools_enabled: unknown;
  created_by: string | null;
  deleted_at: string | null;
  /**
   * Last-modified timestamp from the agents table. Surfaced in the chat
   * empty-state facts row (Session 19, spec §2.8) as "Last updated".
   * The `agents_updated_at` trigger from migration 0001 keeps this
   * current on every UPDATE.
   */
  updated_at: string;
  /**
   * Provenance for externally-sourced agents (migration 0023). NULL for
   * legalOS-native agents; non-NULL drives the edit form into C4L-lock
   * mode and is checked server-side to reject mutations on
   * upstream-managed fields.
   */
  source_origin: string | null;
  department: { slug: string; name: string } | null;
};

/**
 * Returns the agent row for `id` IF the current user can read it (RLS
 * scoped via `agents_read_accessible`), else null. Includes the nested
 * department slug + name for breadcrumb resolution.
 *
 * Single null contract covers all failure modes (missing, RLS-hidden,
 * etc.) — same idiom as `getDepartmentIfAccessible`. Callers narrow
 * further with their own `notFound()` clauses for type/owner/deleted
 * refinement.
 *
 * Wrapped in React's `cache()` for per-request memoization keyed by
 * `id` — agent layout + breadcrumb + rail-active-state + page can all
 * call this with the same id and resolve to a single Supabase
 * round-trip.
 */
export const getAgent = cache(
  async (id: string): Promise<AccessibleAgent | null> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("agents")
      .select(
        "id, name, description, type, is_active, is_template, system_prompt, model, tools_enabled, created_by, deleted_at, updated_at, source_origin, departments!inner(slug, name)",
      )
      .eq("id", id)
      .maybeSingle();

    if (!data) return null;

    const dept =
      (data.departments as unknown as { slug: string; name: string } | null) ??
      null;

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      type: data.type,
      is_active: data.is_active,
      is_template: data.is_template,
      system_prompt: data.system_prompt,
      model: data.model,
      tools_enabled: data.tools_enabled,
      created_by: data.created_by,
      deleted_at: data.deleted_at,
      updated_at: data.updated_at,
      source_origin: data.source_origin,
      department: dept,
    };
  },
);

/**
 * Slim per-agent context the workspace chrome (breadcrumb + rail
 * active-state) needs to resolve `<id>` paths to human-readable names
 * and parent department slugs.
 */
export interface AgentBreadcrumbContext {
  id: string;
  name: string;
  department_slug: string;
  department_name: string;
}

/**
 * Returns every agent the current user can read, projected to the slim
 * `AgentBreadcrumbContext` shape. Active, non-deleted only — soft-
 * deleted agents keep their chat surface (architecture §3) but are
 * intentionally NOT in the rail's active-resolution list since they
 * don't appear in the launchpad either; navigating to a soft-deleted
 * agent's chat URL falls through to the breadcrumb's defensive "Agent"
 * fallback rather than highlighting a parent department.
 *
 * The slim shape is deliberate — the workspace layout fetches this on
 * every render to feed the breadcrumb + rail; full agent rows would
 * be wasteful for what's essentially a `(id, name, dept)` lookup table.
 *
 * Wrapped in `cache()` keyed by `userId` for per-request dedup with
 * any other caller (none today, but matches the 10a posture).
 */
export const getAccessibleAgentsForBreadcrumb = cache(
  async (userId: string): Promise<AgentBreadcrumbContext[]> => {
    // RLS handles row-level scoping; userId is included in the cache
    // key so different user contexts don't share a cached promise.
    void userId;

    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("agents")
      .select("id, name, departments!inner(slug, name)")
      .eq("is_active", true)
      .is("deleted_at", null);

    if (!data) return [];

    return data
      .map((row) => {
        const dept = row.departments as unknown as {
          slug: string;
          name: string;
        } | null;
        if (!dept) return null;
        return {
          id: row.id as string,
          name: row.name as string,
          department_slug: dept.slug,
          department_name: dept.name,
        };
      })
      .filter((a): a is AgentBreadcrumbContext => Boolean(a));
  },
);

/**
 * Returns the department row for `slug` IF the current user has any role
 * in that department, else null.
 *
 * A single null return covers both "slug doesn't exist" and "user has no
 * access to this department". Callers get one branch and cannot leak
 * department existence through differentiated error handling.
 */
export async function getDepartmentIfAccessible(slug: string) {
  const user = await getAuthUser();

  if (!user) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: department } = await supabase
    .from("departments")
    .select("id, slug, name, description")
    .eq("slug", slug)
    // Soft-deleted departments (migration 0043) resolve to null here, so a
    // direct navigation to a removed department's launchpad 404s.
    .is("deleted_at", null)
    .maybeSingle();

  if (!department) {
    return null;
  }

  const { data: access } = await supabase
    .from("user_department_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("department_id", department.id)
    .maybeSingle();

  if (!access) {
    return null;
  }

  return department;
}

/**
 * Returns true if the current user has an org-level admin role
 * (`super_admin` / `org_admin`) OR is `dept_admin` for at least one
 * department. Used by the workspace layout to conditionally render
 * the Admin item in the rail's profile dropdown, and by
 * `requireAdminUser()` to gate admin routes — both paths run on
 * `/workspace/admin` requests, which the `cache()` wrap dedupes to a
 * single pair of Supabase reads per request.
 *
 * Two DB reads (org role, then dept_admin existence) — acceptable at
 * Phase 1 scale. Collapse into a single query in a later phase if
 * this shows up on a page-load flame graph.
 */
export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  // Org role comes from the shared profile (perf item 16: no separate getUser or
  // role round-trip). A null profile means the user has no public.users row, in
  // which case they cannot hold a dept_admin role either, since
  // user_department_roles.user_id is a foreign key to users, so the answer is
  // definitively false — identical to the prior behavior.
  const profile = await getCurrentUserProfile();
  if (!profile) return false;

  if (profile.role === "super_admin" || profile.role === "org_admin") {
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data: deptAdmin } = await supabase
    .from("user_department_roles")
    .select("role")
    .eq("user_id", profile.id)
    .eq("role", "dept_admin")
    .limit(1)
    .maybeSingle();

  return Boolean(deptAdmin);
});

/**
 * Returns true only for org-level admins (super_admin or org_admin).
 *
 * Mirrors the RLS write policy on `public.departments`
 * (`departments_org_admin_write`, migration 0001) — dept_admin is
 * intentionally excluded since their authority is scoped to a single
 * department, not the cross-department structure.
 *
 * Use this instead of `isCurrentUserAdmin()` when gating actions that
 * the underlying RLS policy restricts to org-level admins. Mismatching
 * the app-layer check against the DB-layer check produces affordances
 * that surface for users whose writes get rejected.
 */
export const isCurrentUserOrgAdmin = cache(async (): Promise<boolean> => {
  // Derived from the shared profile (perf item 16); identical result to the prior
  // getUser + role query.
  const profile = await getCurrentUserProfile();
  return profile?.role === "super_admin" || profile?.role === "org_admin";
});

/**
 * Returns true only for `super_admin`.
 *
 * Mirrors the write RLS on `public.connection_policy`
 * (`connection_policy_super_admin_write`, migration 0044), which admits
 * super_admin only — not org_admin or dept_admin. Use this to gate the
 * connection-policy editor (the Policy & access admin area) and its save
 * action, so the app-layer gate matches the DB-layer one (mirror-RLS, D-041):
 * an org_admin who can reach the admin section sees the policy read only and
 * cannot save, rather than being shown controls whose writes RLS rejects.
 */
export const isCurrentUserSuperAdmin = cache(async (): Promise<boolean> => {
  // Derived from the shared profile (perf item 16); identical result to the prior
  // getUser + role query.
  const profile = await getCurrentUserProfile();
  return profile?.role === "super_admin";
});

/**
 * Returns true only for a PLATFORM OWNER — the cross-tenant platform-admin
 * capability for legalOS-the-vendor (C4L/platform arc, migration 0058).
 *
 * This is a SEPARATE AXIS from the org `user_role` enum, NOT a higher org role:
 * it reads the standalone `platform_admins` grant, so a mere `super_admin` does
 * NOT pass, and a person may hold both their org role and this capability. The
 * grant is read-own under RLS and is never self-grantable (the table has no
 * write policy; see migration 0058).
 *
 * Tolerant of the table not existing yet (pre-migration) and of the grant being
 * absent: any read error or empty result resolves to false, so the platform
 * surface simply 404s for everyone until the migration is applied and the grant
 * lands. `cache()`-wrapped like the other gates, so the layout's call and a
 * page/action call within the same request share one round-trip.
 */
export const isCurrentUserPlatformOwner = cache(async (): Promise<boolean> => {
  // platform_admins is a separate table (not in the profile), so this keeps its
  // own query but shares the single getAuthUser() round-trip (perf item 16).
  const user = await getAuthUser();
  if (!user) return false;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Fail closed to "not a platform owner" on any error (missing table
  // pre-migration, or a transient read failure) — the honest, safe default.
  if (error) return false;
  return Boolean(data);
});

/**
 * Gate for platform-admin routes. Redirects unauthenticated users to /login via
 * `requireAuthUser()`; for authenticated-but-not-platform-owner users (INCLUDING
 * org super_admins, who do not have platform access), calls `notFound()` rather
 * than redirecting — the 404 avoids leaking the existence of the platform
 * surface. Mirrors `requireAdminUser`, one tier up.
 */
export async function requirePlatformOwner() {
  const user = await requireAuthUser();
  const isPlatformOwner = await isCurrentUserPlatformOwner();
  if (!isPlatformOwner) {
    notFound();
  }
  return user;
}

/**
 * Slim user row for the admin User access page (Session 29). The page
 * lists every user in the caller's organization; this is the projection
 * threaded through the client list component.
 */
export interface OrgUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "super_admin" | "org_admin" | "user";
  is_active: boolean;
  created_at: string;
}

/**
 * Returns every user in the caller's organization, newest first.
 *
 * App-layer gate: org-admin only. The underlying RLS
 * (`users_read_self_or_dept_peer_or_admin`, migration 0015) admits
 * org-admins to read every row in their org and non-admins to read
 * only self + same-department peers. The mirror-RLS principle (D-041)
 * keeps the app-layer gate tighter than RLS would alone — a non-admin
 * caller gets an empty array, not the dept-peer-scoped subset.
 *
 * Returns [] rather than throwing on gate failure so the admin page
 * can render an empty list cleanly if it's ever reached by a
 * non-admin (the page also notFound()s at the top, so this is
 * defense-in-depth).
 */
export async function getOrgUsers(): Promise<OrgUser[]> {
  if (!(await isCurrentUserOrgAdmin())) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, full_name, role, is_active, created_at")
    .order("created_at", { ascending: false });

  return (data ?? []) as OrgUser[];
}

/**
 * Flat row from `user_department_roles` for the admin matrix view.
 * The admin page fetches all rows once and buckets by user_id in JS
 * so each row's toggle state renders from a single source.
 */
export interface UserDepartmentRoleRow {
  user_id: string;
  department_id: string;
  role: "dept_admin" | "user";
}

/**
 * Returns every `user_department_roles` row visible to the caller.
 * Org-admin gated (mirror-RLS) — the RLS layer (`udr_admin_read_dept`,
 * migration 0001) admits org-admins via `is_department_admin` to read
 * every row in their org, but the app layer narrows to org-admin so
 * a dept_admin caller can't accidentally render the admin user list.
 */
export async function getAllUserDepartmentRoles(): Promise<
  UserDepartmentRoleRow[]
> {
  if (!(await isCurrentUserOrgAdmin())) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_department_roles")
    .select("user_id, department_id, role");

  return (data ?? []) as UserDepartmentRoleRow[];
}

/**
 * Returns the department_ids in the caller's org's default-departments
 * list. Org-admin gated. Used by the admin User access page to render
 * the "Default access for new users" toggleable chip section.
 */
export async function getOrganizationDefaults(): Promise<string[]> {
  if (!(await isCurrentUserOrgAdmin())) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organization_default_departments")
    .select("department_id");

  return (data ?? []).map((r) => r.department_id as string);
}

/**
 * A pending invitation as the People page presents it. `invited_by_name` is the
 * inviter's display name (full name, else email), resolved separately so the
 * read doesn't depend on a PostgREST FK-embed hint. `effective_status` is
 * computed: a pending invite past its `expires_at` reads as "expired" (no cron
 * flips the column; the gate already treats an expired pending as inadmissible).
 */
export interface OrgInvitation {
  id: string;
  email: string;
  role: "super_admin" | "org_admin" | "user";
  department_ids: string[];
  expires_at: string;
  created_at: string;
  invited_by_name: string | null;
  effective_status: "pending" | "expired";
}

/**
 * Returns the org's pending invitations (newest first), org-admin gated. Only
 * `status='pending'` rows are returned — accepted invites appear in the roster,
 * revoked ones are gone. Tolerates the `invitations` table being absent before
 * the A3c migration is applied (returns []). RLS (`invitations_admin_read`,
 * migration 0050) scopes the read to the caller's org.
 */
export async function getOrgInvitations(): Promise<OrgInvitation[]> {
  if (!(await isCurrentUserOrgAdmin())) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, department_ids, expires_at, created_at, invited_by_user_id")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return [];

  // Resolve inviter display names in one extra query (no FK-embed dependency).
  const inviterIds = Array.from(
    new Set(
      data
        .map((r) => r.invited_by_user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const nameById = new Map<string, string>();
  if (inviterIds.length > 0) {
    const { data: inviters } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", inviterIds);
    for (const u of inviters ?? []) {
      nameById.set(
        u.id as string,
        ((u.full_name as string | null)?.trim() || (u.email as string)) ?? "",
      );
    }
  }

  const now = Date.now();
  return data.map((r) => {
    const expiresAt = r.expires_at as string;
    const expired = new Date(expiresAt).getTime() <= now;
    return {
      id: r.id as string,
      email: r.email as string,
      role: r.role as OrgInvitation["role"],
      department_ids: (r.department_ids as string[] | null) ?? [],
      expires_at: expiresAt,
      created_at: r.created_at as string,
      invited_by_name:
        nameById.get(r.invited_by_user_id as string) ?? null,
      effective_status: expired ? "expired" : "pending",
    };
  });
}

/**
 * Returns the organization's configured default model id (the model new agents
 * start with), or null if none is set. Reads `organizations.default_model`,
 * RLS-scoped to the caller's own org (`organizations_read_own`, migration 0001),
 * so any authenticated member can read it.
 *
 * Tolerates the column being absent: this milestone's migration is hand-applied
 * after deploy, so there is a window where the deployed code queries a column
 * that does not exist yet. A read error (including Postgres 42703 undefined_column)
 * resolves to null, and every caller falls back to DEFAULT_MODEL_FALLBACK — the
 * read can never block agent creation, whether or not the migration has landed.
 * Once the migration is applied this simply returns the saved value.
 */
export async function getOrganizationDefaultModel(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("default_model")
    .maybeSingle();

  if (error) {
    // 42703 = undefined_column: expected before the migration is applied. Any
    // other read failure also falls back to the canonical default rather than
    // blocking; log the unexpected ones (no PII — code only).
    if (error.code !== "42703") {
      console.error("getOrganizationDefaultModel read failed", {
        code: error.code,
      });
    }
    return null;
  }

  return ((data?.default_model as string | null) ?? null) || null;
}

/**
 * Gate for admin routes. Redirects unauthenticated users to /login via
 * `requireAuthUser()`; for authenticated-but-not-admin users, calls
 * `notFound()` rather than redirecting — the 404 avoids leaking the
 * existence of the admin section to non-admin accounts.
 */
export async function requireAdminUser() {
  const user = await requireAuthUser();
  const admin = await isCurrentUserAdmin();
  if (!admin) {
    notFound();
  }
  return user;
}

/**
 * Subset of `public.agents` columns the launchpad needs. RLS still scopes
 * results to the current user's organization and the departments they have
 * access to. Exported so callers can import the shape alongside the helper.
 */
export interface LaunchpadAgent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: "external" | "native";
  external_url: string | null;
  category: string | null;
  sort_order: number;
  /**
   * True when this row is a system template (Pattern B canonical agent
   * activated by migration 0019). The launchpad's Approved agents
   * bucket surfaces these as chat-first cards with admin-only Edit /
   * Delete affordances. False for user-owned agents in the My agents
   * bucket.
   */
  is_template: boolean;
  /**
   * Provenance for externally-sourced agents (migration 0023). NULL for
   * legalOS-native agents (Canonical + Personal). Non-NULL values follow
   * the `"<source-id>:<plugin>/<skill>"` pattern — see
   * `lib/agents/source.ts` for the parser and display-label helpers.
   * Routing into the externalAgents bucket on the launchpad is driven by
   * this field being non-NULL, independent of `is_template`.
   */
  source_origin: string | null;
  /**
   * Lightweight settings the launchpad card grid + details-panel header
   * surface. The heavy fields (`system_prompt`, `tools_enabled`,
   * attachments) are deliberately NOT in this shape — they're fetched
   * lazily by `getAgentDetailsAction` when the panel opens, so each
   * department page load doesn't carry ~150KB of authored prompt text
   * through the RSC boundary. Adding any field here that doesn't
   * render on every card costs every visitor that data; route it
   * through the lazy fetch instead.
   */
  model: string | null;
  default_output_format: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Three-bucket department agent loader for the Aperture launchpad:
 *
 *   - departmentAgents — native Canonical templates (`is_template = true
 *     AND source_origin IS NULL`). Session 27 / migration 0019 promoted
 *     these to is_template = true. Chat-first cards with admin-only
 *     Edit / Delete affordances; click routes directly to `/agents/<id>`.
 *   - externalAgents   — agents imported from an external source
 *     (`source_origin IS NOT NULL`), regardless of `is_template`.
 *     Migration 0023 added the source_origin column; the field is
 *     currently always NULL for legalOS-native agents and non-NULL for
 *     sync-pipeline-created rows (Claude for Legal first; future sources
 *     extend the prefix vocabulary). UI rendering for this bucket lands
 *     in a follow-up patch — until then the field flows through but the
 *     bucket is empty.
 *   - myAgents         — user-owned native agents (`is_template = false
 *     AND source_origin IS NULL AND created_by = userId`). Click routes
 *     to the chat surface.
 *
 * Single query + JS bucketing rather than three parallel queries: the
 * row volume per department is small (low tens at v1; couple hundred
 * at most after C4L import), and a single round-trip is simpler than
 * coordinating three indexes for the disjoint predicates.
 *
 * The SQL `.or(...)` predicate restricts the result set to rows that
 * fall into one of the three buckets — without it, RLS would return
 * other users' personal agents in this department (since
 * `agents_read_accessible` only gates on `has_department_access`, not
 * on `created_by`), and JS would have to filter them out.
 *
 * `userId` is a server-validated UUID from `supabase.auth.getUser()`;
 * passing it into the `.or()` string is safe — never user-supplied.
 *
 * Bucketing precedence is `source_origin` first, then `is_template`,
 * then `created_by`. A hypothetical row with both `source_origin` set
 * and `is_template = true` (e.g., a future C4L template) lands in
 * externalAgents, not departmentAgents — externally-sourced agents
 * always render with source attribution, regardless of template status.
 *
 * Sort orders:
 *   - departmentAgents: `sort_order asc, name asc` (curated)
 *   - externalAgents:   `sort_order asc, name asc` (curated; sync
 *                       pipeline will set sort_order from upstream)
 *   - myAgents:         `created_at desc` (most recently created first)
 *
 * Not wrapped in `cache()` — only one caller per request.
 */
export async function getAgentsForDepartmentLaunchpad(
  departmentId: string,
  userId: string,
): Promise<{
  departmentAgents: LaunchpadAgent[];
  /** External (vendor) agents split into one group per source/vendor (Step 4),
   *  filtered to providers the org permits (Step 5). One group with the sole
   *  vendor today (Claude for Legal) when permitted. */
  externalGroups: ExternalAgentGroup<LaunchpadAgent>[];
  /** Whether the org permits vendor content at all (any registered provider
   *  enabled). Drives whether the empty-state "curated content coming" section
   *  shows: when false, the vendor surface is OFF org-wide and nothing renders. */
  vendorContentEnabled: boolean;
  myAgents: LaunchpadAgent[];
}> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("agents")
    .select(
      "id, slug, name, description, type, external_url, category, sort_order, is_template, source_origin, model, default_output_format, created_by, created_at, updated_at",
    )
    .eq("department_id", departmentId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .or(
      `is_template.eq.true,source_origin.not.is.null,created_by.eq.${userId}`,
    );

  type Row = LaunchpadAgent & {
    created_by: string | null;
  };
  const rows = (data ?? []) as Row[];

  const departmentAgents: Row[] = [];
  const externalAgents: Row[] = [];
  const myAgents: Row[] = [];

  for (const row of rows) {
    if (row.source_origin !== null) {
      externalAgents.push(row);
    } else if (row.is_template) {
      departmentAgents.push(row);
    } else if (row.created_by === userId) {
      myAgents.push(row);
    }
    // Else: defensive skip. RLS shouldn't return rows that match no
    // bucket (the `.or()` predicate already excludes other users'
    // personal agents), but this branch keeps the bucketing total.
  }

  const bySortOrderThenName = (a: Row, b: Row) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  const byCreatedAtDesc = (a: Row, b: Row) =>
    b.created_at.localeCompare(a.created_at);

  departmentAgents.sort(bySortOrderThenName);
  externalAgents.sort(bySortOrderThenName);
  myAgents.sort(byCreatedAtDesc);

  const toLaunchpadAgent = (row: Row): LaunchpadAgent => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: row.type,
    external_url: row.external_url,
    category: row.category,
    sort_order: row.sort_order,
    is_template: row.is_template,
    source_origin: row.source_origin,
    model: row.model,
    default_output_format: row.default_output_format,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  // Split the (already sort_order-sorted) external agents into one group per
  // source/vendor (registry-driven, deterministic), then GATE on the org's
  // per-provider enablement (Step 5): a provider a super admin disabled has its
  // section hidden org-wide. Default-permit — a provider with no setting is on.
  const vendorSettings = await getVendorContentSettings();
  const allGroups = groupAgentsBySource(externalAgents.map(toLaunchpadAgent));
  const externalGroups = allGroups.filter((group) =>
    vendorContentEnabledFromSettings(vendorSettings, group.sourceId),
  );
  // The vendor surface is "on" when at least one registered provider is enabled;
  // controls whether the empty-state section shows when a department has none.
  const vendorContentEnabled = VENDOR_PROVIDER_ORDER.some((providerId) =>
    vendorContentEnabledFromSettings(vendorSettings, providerId),
  );

  return {
    departmentAgents: departmentAgents.map(toLaunchpadAgent),
    externalGroups,
    vendorContentEnabled,
    myAgents: myAgents.map(toLaunchpadAgent),
  };
}

/**
 * Subset of `public.agents` the trash page needs. Includes the deletion
 * timestamp (for the "deleted X ago" relative display) and a join to the
 * department for context.
 */
export interface DeletedAgent {
  id: string;
  name: string;
  description: string | null;
  deleted_at: string;
  /**
   * True when the deleted row is a system template (Pattern B). The
   * trash page renders an "Approved agent" chip on these rows so admins
   * can scan their own personal trash from template trash at a glance.
   */
  is_template: boolean;
  department: { slug: string; name: string } | null;
}

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns the soft-deleted agents within the 30-day undo window that
 * the caller can restore, ordered by deletion time descending.
 *
 * Visibility branches on `isOrgAdmin`:
 *
 *   - Non-admin caller: their own user-owned deletions only
 *     (`created_by = userId AND is_template = false`).
 *   - Org-admin caller (super_admin / org_admin per
 *     `isCurrentUserOrgAdmin()`): the union of their own user-owned
 *     deletions AND all template deletions in the org
 *     (`(created_by = userId AND is_template = false) OR
 *      (is_template = true)`). Templates are surfaced so admins can
 *     restore the canonical agents they soft-deleted via the
 *     department launchpad's overflow menu.
 *
 * The 30-day cutoff is computed in the application layer. RLS scopes
 * via the existing agents_read_accessible policy + admin_read_all
 * policy (migration 0001): admins read all org-scoped agents
 * regardless of created_by; non-admins read only rows they have
 * department access to.
 */
export async function getDeletedAgentsForUser(
  userId: string,
  isOrgAdmin = false,
): Promise<DeletedAgent[]> {
  const supabase = await createSupabaseServerClient();
  const cutoff = new Date(Date.now() - RESTORE_WINDOW_MS).toISOString();

  // Both branches return rows with `deleted_at NOT NULL` and within the
  // 30-day cutoff. The admin branch unions in template-typed deletions
  // via PostgREST's `or()` filter; the non-admin branch is just the
  // owner-of-non-template predicate.
  const baseQuery = supabase
    .from("agents")
    .select(
      "id, name, description, deleted_at, is_template, departments(slug, name)",
    )
    .not("deleted_at", "is", null)
    .gt("deleted_at", cutoff)
    .order("deleted_at", { ascending: false });

  const filteredQuery = isOrgAdmin
    ? baseQuery.or(
        `and(created_by.eq.${userId},is_template.eq.false),is_template.eq.true`,
      )
    : baseQuery.eq("created_by", userId).eq("is_template", false);

  const { data } = await filteredQuery;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    deleted_at: row.deleted_at as string,
    is_template: row.is_template as boolean,
    department: row.departments as unknown as
      | { slug: string; name: string }
      | null,
  }));
}

/**
 * One conversation message hydrated for the chat surface on reload, with
 * the Session 18 sources and tool_calls JSONB columns selected so the
 * chat surface can reconstruct the same block list (text + trace cards
 * + sources list) it would have built from streamed events.
 *
 * `content` carries inline `<sup data-source-id="..." />` markers; the
 * markdown renderer + sanitize schema let those through to a
 * <CitationMarker /> override. Tool calls' `position` field is the
 * splice offset into `content` where each trace card slots in.
 */
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: unknown;
  tool_calls: unknown;
  /**
   * Per-message file attachments (chat attachments arc), hydrated alongside
   * the message so the chat surface renders attachment chips on reload, not
   * just optimistically. Empty for messages with no attachments.
   */
  attachments: Array<{
    filename: string;
    sizeBytes: number;
    contentType: string;
  }>;
}

/**
 * Loads a conversation by id WITH its full message list, but only if the
 * conversation belongs to the current user and to the given agent. The
 * agent_id check guards against `?c=<id>` pointing at another agent's
 * conversation — the chat surface assumes its messages belong to the
 * agent in the URL path.
 *
 * Returns null on any of: missing, foreign-user, foreign-agent. Single
 * null contract so callers can fall through to "fresh conversation"
 * without leaking which check failed. RLS would already block foreign
 * reads at the DB layer; the explicit owner+agent check is belt-and-
 * suspenders and lets us return null cleanly rather than receiving an
 * empty PostgREST result.
 */
export async function getConversationForChatSurface(
  conversationId: string,
  agentId: string,
  userId: string,
): Promise<{
  id: string;
  messages: ConversationMessage[];
} | null> {
  const supabase = await createSupabaseServerClient();

  const { data: convo } = await supabase
    .from("conversations")
    .select("id, user_id, agent_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!convo || convo.user_id !== userId || convo.agent_id !== agentId) {
    return null;
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, sources, tool_calls")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const messageRows = (messages ?? []) as Array<
    Omit<ConversationMessage, "attachments">
  >;

  // Hydrate per-message attachments in the same trip (chat attachments arc).
  // Grouped by message_id, ordered by created_at so chips render in the order
  // they were attached.
  const attachmentsByMessage = new Map<
    string,
    ConversationMessage["attachments"]
  >();
  if (messageRows.length > 0) {
    const { data: attachmentRows } = await supabase
      .from("message_attachments")
      .select("message_id, original_filename, size_bytes, content_type")
      .in(
        "message_id",
        messageRows.map((m) => m.id),
      )
      .order("created_at", { ascending: true });
    for (const row of attachmentRows ?? []) {
      const list = attachmentsByMessage.get(row.message_id) ?? [];
      list.push({
        filename: row.original_filename,
        sizeBytes: Number(row.size_bytes),
        contentType: row.content_type,
      });
      attachmentsByMessage.set(row.message_id, list);
    }
  }

  return {
    id: convo.id,
    messages: messageRows.map((m) => ({
      ...m,
      attachments: attachmentsByMessage.get(m.id) ?? [],
    })),
  };
}
