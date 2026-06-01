import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PeopleDefaultDepartments } from "@/components/admin/people/default-departments";
import { PersonList } from "@/components/admin/people/person-list";
import type { RosterDepartment } from "@/components/admin/people/person-row";
import {
  getAllDepartmentsWithAccess,
  getAllUserDepartmentRoles,
  getOrganizationDefaults,
  getOrgUsers,
  isCurrentUserOrgAdmin,
  isCurrentUserSuperAdmin,
  requireAuthUser,
} from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "People",
};

/**
 * People (GOVERN, A3a) — the team roster, the org-role editor, and the new-user
 * default-departments setting. Replaces the old admin Users page's roster +
 * access + defaults and adds in-product role editing.
 *
 * Gating: viewing requires org-admin (matching the old Users page), enforced here
 * (`isCurrentUserOrgAdmin()` → notFound) and re-gated in each data helper
 * (defense-in-depth). Whether the actor is super_admin decides what the role
 * editor offers — the page resolves it once and threads `actorRole` down. The
 * role editor's writes are governed by the escalation rule, enforced in three
 * layers (UI here, the server action, and the migration-0048 trigger).
 *
 * The old Users page (/workspace/admin/users) stays reachable but unlinked until
 * People fully supersedes it at the end of the People sub-arc (after A3c); it is
 * not retired here, to avoid losing anything mid-build.
 *
 * The admin layout owns the 896px left-justified `<main>`; this page renders a
 * fragment inside it, in the Policy & access register (44px title, 17px section
 * headings, calm copy).
 */
export default async function AdminPeoplePage() {
  const user = await requireAuthUser();
  if (!(await isCurrentUserOrgAdmin())) {
    notFound();
  }

  const [isSuperAdmin, departmentsWithAccess, users, defaultIds, allRoles] =
    await Promise.all([
      isCurrentUserSuperAdmin(),
      getAllDepartmentsWithAccess(user.id),
      getOrgUsers(),
      getOrganizationDefaults(),
      getAllUserDepartmentRoles(),
    ]);

  const actorRole: "super_admin" | "org_admin" = isSuperAdmin
    ? "super_admin"
    : "org_admin";

  // Strip hasAccess — the admin context shows access per user, not the admin's
  // own access state.
  const allDepartments: RosterDepartment[] = departmentsWithAccess.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    sort_order: d.sort_order,
  }));

  // Bucket the flat user_department_roles rows by user_id once. Plain
  // Record<user_id, department_id[]> so the shape serializes across the RSC
  // boundary into each row.
  const accessByUser: Record<string, string[]> = {};
  for (const r of allRoles) {
    const bucket = accessByUser[r.user_id] ?? (accessByUser[r.user_id] = []);
    bucket.push(r.department_id);
  }

  const superAdminCount = users.filter((u) => u.role === "super_admin").length;

  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          People
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Everyone in your organization, the role each person holds, and the
          departments they can use. Role changes follow least-privilege rules, so
          only a super admin can grant the super admin role.
        </p>
        {!isSuperAdmin ? (
          <p className="mt-3 max-w-[60ch] text-[13px] leading-[1.5] text-caption">
            You can manage user and organization-admin roles. Only a super admin
            can grant or change the super admin role.
          </p>
        ) : null}
      </header>

      <div className="mt-10 flex flex-col gap-12">
        <PersonList
          users={users}
          allDepartments={allDepartments}
          accessByUser={accessByUser}
          actorRole={actorRole}
          actorUserId={user.id}
          superAdminCount={superAdminCount}
        />
        <PeopleDefaultDepartments
          allDepartments={allDepartments}
          initialDefaultIds={defaultIds}
        />
      </div>
    </>
  );
}
