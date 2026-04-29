import { notFound, redirect } from "next/navigation";

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
 */
export async function requireAuthUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * Returns the `public.users` profile for the current auth user, or null
 * if the user is unauthenticated or not yet provisioned (proxy race,
 * or the organization row doesn't exist yet).
 */
export async function getCurrentUserProfile() {
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
