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
    .select("id, email, full_name, role, organization_id, is_active")
    .eq("id", authUser.id)
    .maybeSingle();

  return data;
});

/**
 * Subset of `public.departments` columns the launchpad UI needs.
 */
export interface AccessibleDepartment {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

/**
 * Returns the departments the current user has at least one role in,
 * ordered by `sort_order` ascending. Used by the picker page at `/` and
 * the department tab bar on `/departments/[slug]` so both surfaces show
 * the same accessible-departments list.
 *
 * The query joins `user_department_roles` with `departments` via an
 * INNER PostgREST join — same predicate `has_department_access` checks
 * per row, applied across all departments at once. RLS still scopes
 * `departments` reads to the user's organization so cross-org leakage
 * is impossible even if `user_department_roles` were corrupted.
 *
 * Wrapped in React's `cache()` for per-request memoization keyed by
 * `userId` — layout + child page calling this with the same userId
 * resolve to a single PostgREST round-trip.
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
 * department. Used by the main nav to conditionally render the Admin
 * link and by `requireAdminUser()` to gate admin routes.
 *
 * Two DB reads (org role, then dept_admin existence) — acceptable at
 * Phase 1 scale. Collapse into a single query in a later phase if this
 * shows up on a page-load flame graph.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
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
}

/**
 * Two-bucket department agent loader for the Session 8f-A IA: system
 * Templates (is_template = true) and the user's own agents
 * (created_by = auth.uid(), is_template = false, deleted_at IS NULL).
 *
 * Two queries instead of one because the predicates are different shapes
 * and Postgres uses different indexes (agents_is_template_idx vs the
 * partial agents_active_idx from migration 0006). Cleaner and faster
 * than partitioning a flat result in JS.
 *
 * Both queries are RLS-scoped — `agents_read_accessible` requires
 * `has_department_access(department_id)` for SELECT, so an unauthorized
 * user gets an empty result without an error.
 *
 * Templates are sorted by `sort_order` (preserves curated ordering, with
 * the Blank Agent at sort_order = 0 leading); user agents are sorted by
 * `created_at desc` so the most recently created appears first.
 */
export async function getAgentsForDepartmentSplit(
  departmentId: string,
  userId: string,
): Promise<{ templates: LaunchpadAgent[]; myAgents: LaunchpadAgent[] }> {
  const supabase = await createSupabaseServerClient();

  const [templatesResult, myAgentsResult] = await Promise.all([
    supabase
      .from("agents")
      .select(
        "id, slug, name, description, type, external_url, category, sort_order",
      )
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .eq("is_template", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("agents")
      .select(
        "id, slug, name, description, type, external_url, category, sort_order",
      )
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .eq("is_template", false)
      .eq("created_by", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  return {
    templates: (templatesResult.data ?? []) as LaunchpadAgent[],
    myAgents: (myAgentsResult.data ?? []) as LaunchpadAgent[],
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
  department: { slug: string; name: string } | null;
}

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns the user's soft-deleted agents within the 30-day undo window,
 * ordered by deletion time descending (most recently deleted first).
 *
 * The 30-day cutoff is computed in the application layer and passed to
 * Postgres as an ISO timestamp. Slight clock skew between Next and
 * Postgres is tolerable at single-user scale; if it ever matters, lift
 * the cutoff into a SQL `now() - interval '30 days'` predicate.
 *
 * RLS scopes via the existing agents_read_accessible policy: a user can
 * only read agents in their org and accessible departments. The explicit
 * `created_by = userId` filter narrows further to ownership.
 */
export async function getDeletedAgentsForUser(
  userId: string,
): Promise<DeletedAgent[]> {
  const supabase = await createSupabaseServerClient();
  const cutoff = new Date(Date.now() - RESTORE_WINDOW_MS).toISOString();

  const { data } = await supabase
    .from("agents")
    .select(
      "id, name, description, deleted_at, departments(slug, name)",
    )
    .eq("created_by", userId)
    .eq("is_template", false)
    .not("deleted_at", "is", null)
    .gt("deleted_at", cutoff)
    .order("deleted_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    deleted_at: row.deleted_at as string,
    department: row.departments as unknown as
      | { slug: string; name: string }
      | null,
  }));
}

/**
 * Cheap count for the main-nav's conditional Trash link. Returns true
 * when the user has at least one soft-deleted agent in the 30-day
 * window. The nav doesn't need the rows themselves; a HEAD count is
 * the smallest read.
 */
export async function userHasDeletedAgents(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const cutoff = new Date(Date.now() - RESTORE_WINDOW_MS).toISOString();

  const { count } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .eq("is_template", false)
    .not("deleted_at", "is", null)
    .gt("deleted_at", cutoff);

  return (count ?? 0) > 0;
}
