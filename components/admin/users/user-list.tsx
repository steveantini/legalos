import type { OrgUser } from "@/lib/auth/access";

import { UserAccessRow, type AdminDepartment } from "./user-access-row";

/**
 * Lists every user in the org as an expandable row (Session 29). Server
 * component — no client state lives here. The row component itself
 * (`UserAccessRow`) is the client boundary, owning expansion + access
 * toggle state per row.
 *
 * `accessByUser` is keyed by user_id and carries the user's set of
 * accessible department_ids as a plain string[]. Plain arrays serialize
 * across the RSC boundary cleanly (Set/Map do not), so the page's
 * bucket-by-user-id step produces a Record, not a Map.
 */
export function UserList({
  allDepartments,
  users,
  accessByUser,
}: {
  allDepartments: AdminDepartment[];
  users: OrgUser[];
  accessByUser: Record<string, string[]>;
}) {
  const userWord = users.length === 1 ? "user" : "users";
  return (
    <section>
      <header>
        <h2 className="text-base font-semibold">Users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {users.length} {userWord} in your organization.
        </p>
      </header>
      {users.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {users.map((u) => (
            <UserAccessRow
              key={u.id}
              user={u}
              allDepartments={allDepartments}
              initialAccessIds={accessByUser[u.id] ?? []}
            />
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No users found.
        </div>
      )}
    </section>
  );
}
