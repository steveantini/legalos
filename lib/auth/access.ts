import { notFound, redirect } from "next/navigation";
import { cache } from "react";

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
export const requireAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

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
        .select("id, slug, name, description, sort_order")
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: department } = await supabase
    .from("departments")
    .select("id, slug, name, description")
    .eq("slug", slug)
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profile &&
    (profile.role === "super_admin" || profile.role === "org_admin")
  ) {
    return true;
  }

  const { data: deptAdmin } = await supabase
    .from("user_department_roles")
    .select("role")
    .eq("user_id", user.id)
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "super_admin" || profile?.role === "org_admin";
});

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
   * activated by migration 0019). The launchpad's Department Agents
   * bucket surfaces these as chat-first cards with admin-only Edit /
   * Delete affordances. False for user-owned agents in the My Agents
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
   * Settings columns the read-only details panel surfaces for Canonical
   * and C4L agents. Always selected because including them in the existing
   * round-trip is cheaper than a second fetch on panel open. `system_prompt`
   * is the heaviest of the new fields (multi-KB on C4L imports) but still
   * acceptable at v1 row counts (~20 agents per department).
   */
  model: string | null;
  default_output_format: string | null;
  tools_enabled: unknown;
  system_prompt: string | null;
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
  externalAgents: LaunchpadAgent[];
  myAgents: LaunchpadAgent[];
}> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("agents")
    .select(
      "id, slug, name, description, type, external_url, category, sort_order, is_template, source_origin, model, default_output_format, tools_enabled, system_prompt, created_by, created_at, updated_at",
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
    tools_enabled: row.tools_enabled,
    system_prompt: row.system_prompt,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  return {
    departmentAgents: departmentAgents.map(toLaunchpadAgent),
    externalAgents: externalAgents.map(toLaunchpadAgent),
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
   * trash page renders a "Department Agent" chip on these rows so admins
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

  return {
    id: convo.id,
    messages: (messages ?? []) as ConversationMessage[],
  };
}
