import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RunWorkflowForm } from "@/components/workflows/run-workflow-form";
import { StatusDotPill } from "@/components/workflows/run-status-pill";
import { getCurrentUserProfile, requireAuthUser } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AUTONOMY_LABEL,
  RUN_STATUS_LABEL,
  formatRunTimestamp,
  runStatusTone,
  statusPulses,
  stepTypeLabel,
} from "@/lib/workflows/run-view";
import type { AutonomyLevel, WorkflowRunStatus, WorkflowStep } from "@/lib/workflows/types";

export const metadata: Metadata = {
  title: "Run workflow",
};

type DefinitionRow = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  definition: { steps?: WorkflowStep[] } | null;
};

type RunListRow = {
  id: string;
  status: WorkflowRunStatus;
  autonomy_level: AutonomyLevel;
  triggered_by: string | null;
  created_at: string;
  started_at: string | null;
};

/**
 * Start a run of a saved workflow (Workflows arc, Step 4b), and see its recent
 * runs. Any org member who can read the definition (RLS: org-scoped,
 * department-gated when the workflow is department-scoped) can run it — the
 * run they start is theirs (they own its approvals). The recent-runs list is
 * RLS-honest: members see their own runs; org admins see all runs in the org.
 */
export default async function RunWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuthUser();
  const profile = await getCurrentUserProfile();
  if (!profile) notFound();

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workflow_definitions")
    .select("id, name, description, status, definition")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const workflow = data as DefinitionRow;
  const steps: WorkflowStep[] = Array.isArray(workflow.definition?.steps)
    ? workflow.definition.steps
    : [];

  // Agent names for the step preview, plus this workflow's recent runs.
  const agentIds = [
    ...new Set(steps.filter((s) => s.type === "agent").map((s) => s.agentId)),
  ];
  const [agentsRes, runsRes] = await Promise.all([
    agentIds.length > 0
      ? supabase.from("agents").select("id, name").in("id", agentIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("workflow_runs")
      .select("id, status, autonomy_level, triggered_by, created_at, started_at")
      .eq("workflow_definition_id", workflow.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const agentNameById = new Map(
    ((agentsRes.data ?? []) as Array<{ id: string; name: string }>).map((a) => [
      a.id,
      a.name,
    ]),
  );
  const runs = (runsRes.data ?? []) as RunListRow[];

  // Display names for who started each run ("you" for the viewer).
  const runnerIds = [
    ...new Set(
      runs
        .map((r) => r.triggered_by)
        .filter((v): v is string => Boolean(v) && v !== profile.id),
    ),
  ];
  const { data: runnerRows } =
    runnerIds.length > 0
      ? await supabase.from("users").select("id, full_name, email").in("id", runnerIds)
      : { data: [] };
  const runnerNameById = new Map(
    ((runnerRows ?? []) as Array<{ id: string; full_name: string | null; email: string }>).map(
      (u) => [u.id, u.full_name?.trim() || u.email],
    ),
  );

  const isActive = workflow.status === "active";

  return (
    <main className="flex w-full max-w-3xl flex-col gap-9">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
          Run workflow
        </p>
        <h1 className="mt-2 text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          {workflow.name}
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          {workflow.description ||
            "Provide the input, choose how much autonomy this run has, and start it. You can follow every step and approve along the way."}
        </p>
      </header>

      {steps.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Steps this workflow will take">
          <h2 className="text-[17px] font-medium tracking-[-0.012em] text-foreground">
            What will happen
          </h2>
          <ol className="flex flex-col gap-2">
            {steps.map((step, index) => (
              <li key={step.id} className="flex items-center gap-2.5">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <span className="text-[13.5px] text-foreground">{step.name}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {stepTypeLabel(step, agentNameById)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {isActive ? (
        <section className="flex flex-col gap-4" aria-label="Start a run">
          <h2 className="text-[17px] font-medium tracking-[-0.012em] text-foreground">
            Start a run
          </h2>
          <RunWorkflowForm definitionId={workflow.id} />
        </section>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-foreground">
            This workflow isn&rsquo;t active
          </p>
          <p className="max-w-[44ch] text-[13.5px] leading-[1.5] text-muted-foreground">
            Only active workflows can run. An admin can activate it in the builder.
          </p>
        </div>
      )}

      <section className="flex flex-col gap-3" aria-label="Recent runs">
        <h2 className="text-[17px] font-medium tracking-[-0.012em] text-foreground">
          Recent runs
        </h2>
        {runs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {runs.map((run) => {
              const startedBy =
                run.triggered_by === profile.id
                  ? "you"
                  : (run.triggered_by && runnerNameById.get(run.triggered_by)) ||
                    "a teammate";
              return (
                <li key={run.id}>
                  <Link
                    href={`/workspace/workflows/runs/${run.id}`}
                    className="flex items-center justify-between gap-4 rounded-[14px] border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusDotPill
                        label={RUN_STATUS_LABEL[run.status]}
                        tone={runStatusTone(run.status)}
                        pulse={statusPulses(run.status)}
                      />
                      <span className="text-[12.5px] text-muted-foreground">
                        {formatRunTimestamp(run.started_at ?? run.created_at)} ·{" "}
                        {AUTONOMY_LABEL[run.autonomy_level]} · Started by {startedBy}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      View run
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-[14px] border border-dashed border-border bg-card/50 px-4 py-6 text-center text-[13px] text-muted-foreground">
            No runs yet.{isActive ? " Start the first one above." : ""}
          </p>
        )}
      </section>
    </main>
  );
}
