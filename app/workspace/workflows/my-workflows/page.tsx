import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { requireAuthUser, isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Workflows",
};

type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  definition: { steps?: unknown[] } | null;
  updated_at: string;
};

const STATUS_LABEL: Record<WorkflowRow["status"], string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

function StatusPill({ status }: { status: WorkflowRow["status"] }) {
  const dot =
    status === "active"
      ? "bg-emerald-500"
      : status === "draft"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function stepCount(definition: WorkflowRow["definition"]): number {
  return Array.isArray(definition?.steps) ? definition.steps.length : 0;
}

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function MyWorkflowsPage() {
  await requireAuthUser();
  const canAuthor = await isCurrentUserOrgAdmin();

  const supabase = await createSupabaseServerClient();
  // Templates live in the Template Library, not here (Step 5): My Workflows
  // shows what the org composed and owns, including forks of templates.
  const { data } = await supabase
    .from("workflow_definitions")
    .select("id, name, description, status, definition, updated_at")
    .neq("status", "template")
    .order("updated_at", { ascending: false });
  const workflows = (data ?? []) as WorkflowRow[];

  return (
    <main className="flex w-full max-w-4xl flex-col gap-9">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            My workflows
          </h1>
          <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Multi-step sequences your team can run: an agent, an action on a
            connected tool, or a pause for human approval, composed in order. Built
            from the agents and tools your organization already has.
          </p>
        </div>
        {canAuthor ? (
          <Link
            href="/workspace/workflows/my-workflows/new"
            className={`${buttonVariants({ size: "sm" })} mt-2 shrink-0`}
          >
            New workflow
          </Link>
        ) : null}
      </header>

      {workflows.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {workflows.map((wf) => {
            const count = stepCount(wf.definition);
            const meta = (
              <>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-[17px] font-medium leading-[1.2] tracking-[-0.012em] text-foreground">
                    {wf.name}
                  </h2>
                  <StatusPill status={wf.status} />
                </div>
                {wf.description ? (
                  <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-[1.45] text-muted-foreground">
                    {wf.description}
                  </p>
                ) : null}
                <p className="mt-3 text-[12px] text-muted-foreground">
                  {count === 1 ? "1 step" : `${count} steps`} · Updated{" "}
                  {formatUpdated(wf.updated_at)}
                </p>
              </>
            );
            const canRun = wf.status === "active";
            return (
              <li
                key={wf.id}
                className="rounded-[14px] border border-border bg-card p-5"
              >
                {meta}
                {canRun || canAuthor ? (
                  <div className="mt-4 flex items-center gap-2">
                    {canRun ? (
                      <Link
                        href={`/workspace/workflows/my-workflows/${wf.id}/run`}
                        aria-label={`Run ${wf.name}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Run
                      </Link>
                    ) : null}
                    {canAuthor ? (
                      <Link
                        href={`/workspace/workflows/my-workflows/${wf.id}/edit`}
                        aria-label={`Edit ${wf.name}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Edit
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-[14px] border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-foreground">
            No workflows yet
          </p>
          <p className="max-w-[42ch] text-[13.5px] leading-[1.5] text-muted-foreground">
            {canAuthor
              ? "Compose your first multi-step workflow from the agents and tools your organization already has."
              : "Your organization hasn't created any workflows yet. Ask an admin to set one up."}
          </p>
          {canAuthor ? (
            <Link
              href="/workspace/workflows/my-workflows/new"
              className={`${buttonVariants({ size: "sm" })} mt-1`}
            >
              Create your first workflow
            </Link>
          ) : null}
        </div>
      )}
    </main>
  );
}
