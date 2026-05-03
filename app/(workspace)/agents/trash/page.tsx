import { RestoreButton } from "@/components/agents/restore-button";
import { getDeletedAgentsForUser, requireAuthUser } from "@/lib/auth/access";

/**
 * Trash page — content only. Inherits chrome (rail + top bar) from
 * `app/(workspace)/layout.tsx`. Lists the user's soft-deleted agents
 * within the 30-day undo window. Each row offers a Restore button that
 * calls `restoreAgentAction` via a `<form>` (no client-side state — the
 * action runs server-side and `revalidatePath("/agents/trash")` removes
 * the row from the list on the next render).
 *
 * Beyond-30-day rows are filtered out by the query and remain in the DB
 * until a future cron job hard-deletes them. Hard delete is not user-
 * callable.
 */
export default async function TrashPage() {
  const user = await requireAuthUser();
  const deleted = await getDeletedAgentsForUser(user.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
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
                <p className="font-medium">{agent.name}</p>
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
