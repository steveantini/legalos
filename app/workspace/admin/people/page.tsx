import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PeopleDefaultDepartments } from "@/components/admin/people/default-departments";
import { InvitePerson } from "@/components/admin/people/invite-person";
import { PendingInvitations } from "@/components/admin/people/pending-invitations";
import { PersonList } from "@/components/admin/people/person-list";
import type { RosterDepartment } from "@/components/admin/people/person-row";
import {
  getAllDepartmentsWithAccess,
  getAllUserDepartmentRoles,
  getOrganizationDefaults,
  getOrgInvitations,
  getOrgUsers,
  isCurrentUserOrgAdmin,
  isCurrentUserSuperAdmin,
  requireAuthUser,
} from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "People",
};

/**
 * People (GOVERN) — the complete People area: the team roster, the org-role
 * editor (A3a), soft deactivation (A3b), the new-user default-departments
 * setting, and invitations (A3c). The old admin Users page is retired; this is
 * the sole implementation (a 308 redirect at next.config.ts catches old links).
 *
 * Gating: viewing requires org-admin, enforced here (`isCurrentUserOrgAdmin()` →
 * notFound) and re-gated in each data helper (defense-in-depth). Whether the
 * actor is super_admin decides what the role editor and the invite form offer —
 * the page resolves it once and threads `actorRole` down. Every people mutation
 * is governed by the escalation rule, enforced in three layers (UI here, the
 * server actions, and the migration-0048/0049/0050 triggers).
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

  const [
    isSuperAdmin,
    departmentsWithAccess,
    users,
    defaultIds,
    allRoles,
    invitations,
  ] = await Promise.all([
    isCurrentUserSuperAdmin(),
    getAllDepartmentsWithAccess(user.id),
    getOrgUsers(),
    getOrganizationDefaults(),
    getAllUserDepartmentRoles(),
    getOrgInvitations(),
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

  const activeSuperAdminCount = users.filter(
    (u) => u.role === "super_admin" && u.is_active,
  ).length;

  return (
    <>
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            People
          </h1>
          <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Everyone in your organization, the role each person holds, and the
            departments they can use. Role changes follow least-privilege rules,
            so only a super admin can grant the super admin role.
          </p>
          {!isSuperAdmin ? (
            <p className="mt-3 max-w-[60ch] text-[13px] leading-[1.5] text-caption">
              You can manage user and organization-admin roles. Only a super
              admin can grant or change the super admin role.
            </p>
          ) : null}
        </div>
        <div className="mt-2 shrink-0">
          <InvitePerson actorRole={actorRole} allDepartments={allDepartments} />
        </div>
      </header>

      <div className="mt-10 flex flex-col gap-12">
        <PersonList
          users={users}
          allDepartments={allDepartments}
          accessByUser={accessByUser}
          actorRole={actorRole}
          actorUserId={user.id}
          activeSuperAdminCount={activeSuperAdminCount}
        />
        <PendingInvitations
          invitations={invitations}
          actorRole={actorRole}
          allDepartments={allDepartments}
        />
        <PeopleDefaultDepartments
          allDepartments={allDepartments}
          initialDefaultIds={defaultIds}
        />
      </div>
    </>
  );
}
