import type { OrgUser } from "@/lib/auth/access";

import { PersonRow, type RosterDepartment } from "./person-row";

/**
 * The People roster (A3a) — every user in the org as an expandable row. Server
 * component; each `PersonRow` is the client boundary owning its own role and
 * department-access state.
 *
 * `accessByUser` is keyed by user_id and carries each user's accessible
 * department_ids as a plain string[] (serializes cleanly across the RSC
 * boundary, unlike a Set/Map). The page buckets the flat role rows once.
 *
 * `activeSuperAdminCount` lets each row decide whether its user is the org's only
 * ACTIVE super_admin (the lockout guard shared by the role editor and the status
 * control) without every row recomputing it. `actorRole` / `actorUserId` thread
 * the viewing admin's authority down so each row renders honestly.
 */
export function PersonList({
  users,
  allDepartments,
  accessByUser,
  actorRole,
  actorUserId,
  activeSuperAdminCount,
}: {
  users: OrgUser[];
  allDepartments: RosterDepartment[];
  accessByUser: Record<string, string[]>;
  actorRole: "super_admin" | "org_admin";
  actorUserId: string;
  activeSuperAdminCount: number;
}) {
  const userWord = users.length === 1 ? "person" : "people";
  return (
    <section aria-labelledby="people-roster">
      <h2
        id="people-roster"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        Roster
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        {users.length} {userWord} in your organization. Expand a person to change
        their role or department access.
      </p>

      {users.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {users.map((u) => (
            <PersonRow
              key={u.id}
              person={u}
              allDepartments={allDepartments}
              initialAccessIds={accessByUser[u.id] ?? []}
              actorRole={actorRole}
              actorUserId={actorUserId}
              isOnlyActiveSuperAdmin={
                u.role === "super_admin" &&
                u.is_active &&
                activeSuperAdminCount === 1
              }
            />
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-lg bg-paper-2 px-5 py-6 text-center text-[13px] text-muted-foreground">
          No people found.
        </div>
      )}
    </section>
  );
}
