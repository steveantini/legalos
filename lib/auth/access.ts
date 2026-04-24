import { redirect } from "next/navigation";

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
 * Returns active agents for a given department, ordered by category then
 * `sort_order`. Callers typically resolve the department first via
 * `getDepartmentIfAccessible` and pass its id here.
 *
 * The explicit `is_active = true` filter matters: the
 * `agents_admin_read_all` RLS policy (schema 0001) exposes inactive
 * agents to `dept_admin` / `org_admin` users. The launchpad shows only
 * active agents regardless of role.
 */
export async function getAgentsForDepartment(
  departmentId: string,
): Promise<LaunchpadAgent[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("agents")
    .select(
      "id, slug, name, description, type, external_url, category, sort_order",
    )
    .eq("department_id", departmentId)
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  return (data ?? []) as LaunchpadAgent[];
}
