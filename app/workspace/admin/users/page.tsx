import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DefaultDepartmentsSection } from "@/components/admin/users/default-departments-section";
import { UserList } from "@/components/admin/users/user-list";
import type { AdminDepartment } from "@/components/admin/users/user-access-row";
import {
  getAllDepartmentsWithAccess,
  getAllUserDepartmentRoles,
  getOrganizationDefaults,
  getOrgUsers,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";

/**
 * Admin User access page (Session 29 — Thread 6).
 *
 * Org-admin gated. The parent admin layout already gates on
 * `requireAdminUser()` (super_admin / org_admin / any dept_admin); this
 * page tightens to org-admin only via `isCurrentUserOrgAdmin()` →
 * `notFound()` since user-access management is org-level work, not
 * department-level. The 404 fall-through (rather than redirect)
 * matches the layout's "don't leak the existence of the section to
 * non-eligible accounts" posture.
 *
 * Server-side fetches:
 *   - getAllDepartmentsWithAccess(user.id) — returns DepartmentWithAccess[]
 *     but we strip the hasAccess field at the boundary since the admin
 *     context is "all departments in the org, neutral of the admin's
 *     own access state." Saves a separate org-wide-departments helper
 *     at the cost of one ignored field per row.
 *   - getOrgUsers() — every user in the org.
 *   - getOrganizationDefaults() — the org's current default department
 *     set, as a flat array of department_ids.
 *   - getAllUserDepartmentRoles() — every user_department_roles row
 *     visible to the org-admin caller. Bucketed by user_id into a Map
 *     so each <UserAccessRow> receives only its user's access set.
 *
 * All four fetches run in parallel. Each is independently org-admin
 * gated at the helper layer — defense-in-depth against a future page
 * tweak that lands here without the notFound() guard.
 */

export const metadata: Metadata = {
  title: "User access",
};

export default async function AdminUsersPage() {
  const user = await requireAuthUser();
  if (!(await isCurrentUserOrgAdmin())) {
    notFound();
  }

  const [departmentsWithAccess, users, defaultIds, allRoles] =
    await Promise.all([
      getAllDepartmentsWithAccess(user.id),
      getOrgUsers(),
      getOrganizationDefaults(),
      getAllUserDepartmentRoles(),
    ]);

  // Strip hasAccess — irrelevant in admin context (the page shows
  // access per user, not the admin's own access state).
  const allDepartments: AdminDepartment[] = departmentsWithAccess.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    sort_order: d.sort_order,
  }));

  // Bucket flat user_department_roles rows by user_id once. Plain
  // Record<user_id, department_id[]> rather than Map<id, Set> so the
  // shape serializes across the RSC boundary into UserAccessRow.
  const accessByUser: Record<string, string[]> = {};
  for (const r of allRoles) {
    const bucket = accessByUser[r.user_id] ?? (accessByUser[r.user_id] = []);
    bucket.push(r.department_id);
  }

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold">User Access</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Configure defaults to set the departments new users receive
          automatically at first sign-in. Manage per-user access below.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-9">
        <DefaultDepartmentsSection
          allDepartments={allDepartments}
          initialDefaultIds={defaultIds}
        />
        <UserList
          allDepartments={allDepartments}
          users={users}
          accessByUser={accessByUser}
        />
      </div>
    </>
  );
}
