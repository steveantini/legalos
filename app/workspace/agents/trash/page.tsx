import { RestoreButton } from "@/components/agents/restore-button";
import {
  getDeletedAgentsForUser,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";

/**
 * Trash page — content only. Inherits chrome (rail + top bar) from
 * `app/(workspace)/layout.tsx`. Lists soft-deleted agents within the
 * 30-day undo window. Each row offers a Restore button that calls
 * `restoreAgentAction` via a `<form>` (no client-side state — the
 * action runs server-side and `revalidatePath("/agents/trash")`
 * removes the row from the list on the next render).
 *
 * Visibility branches on org-admin role (Session 27):
 *
 *   - Non-admin viewers see their own user-owned deletions only.
 *   - Org-admin viewers see their own user-owned deletions PLUS all
 *     template deletions in the org (Pattern B canonicals soft-
 *     deleted via the launchpad overflow menu). Template rows render
 *     a "Department Agent" chip next to the name so admins can scan
 *     personal trash from template trash at a glance.
 *
 * Beyond-30-day rows are filtered out by the query and remain in the
 * DB until a future cron job hard-deletes them. Hard delete is not
 * user-callable.
 */
export default async function TrashPage() {
  const user = await requireAuthUser();
  const isOrgAdmin = await isCurrentUserOrgAdmin();
  const deleted = await getDeletedAgentsForUser(user.id, isOrgAdmin);

  return (
    <main className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Trash</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Soft-deleted agents stay here for 30 days. After that, they are
          permanently removed.
        </p>
      </header>

      {deleted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Trash is empty.</p>
      ) : (
        <ul className="space-y-3">
          {deleted.map((agent) => (
            <li
              key={agent.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{agent.name}</p>
                  {agent.is_template ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-chat-cite-bg px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
                      <span
                        aria-hidden
                        className="h-[5px] w-[5px] rounded-full bg-primary"
                      />
                      Department Agent
                    </span>
                  ) : null}
                </div>
                {agent.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {agent.description}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {agent.department ? agent.department.name + " · " : ""}
                  Deleted {formatRelative(agent.deleted_at)}
                </p>
              </div>
              <RestoreButton agentId={agent.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const deltaSeconds = Math.round((then - Date.now()) / 1000);
  const absSeconds = Math.abs(deltaSeconds);
  if (absSeconds < 60) {
    return RELATIVE_FORMATTER.format(deltaSeconds, "second");
  }
  if (absSeconds < 3600) {
    return RELATIVE_FORMATTER.format(Math.round(deltaSeconds / 60), "minute");
  }
  if (absSeconds < 86400) {
    return RELATIVE_FORMATTER.format(Math.round(deltaSeconds / 3600), "hour");
  }
  return RELATIVE_FORMATTER.format(Math.round(deltaSeconds / 86400), "day");
}
