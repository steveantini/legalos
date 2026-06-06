import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RunApprovalCard } from "@/components/workflows/run-approval-card";
import { RunAutoRefresh } from "@/components/workflows/run-auto-refresh";
import { StatusDotPill } from "@/components/workflows/run-status-pill";
import { getCurrentUserProfile, requireAuthUser } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  AUTONOMY_LABEL,
  LONG_VALUE_THRESHOLD,
  RUN_STATUS_LABEL,
  STEP_STATUS_LABEL,
  deriveTimeline,
  formatDuration,
  formatRunTimestamp,
  pendingWriteArgKeys,
  pendingWriteToolLabel,
  renderRunValue,
  runStatusTone,
  statusPulses,
  stepProvenanceLabel,
  stepStatusTone,
  type RenderedValue,
  type StepDecision,
  type StepRunRow,
} from "@/lib/workflows/run-view";
import { asWorkflowDefinition } from "@/lib/workflows/validate";
import type { AutonomyLevel, WorkflowRunStatus } from "@/lib/workflows/types";

export const metadata: Metadata = {
  title: "Workflow run",
};

type RunRow = {
  id: string;
  workflow_definition_id: string | null;
  definition_snapshot: unknown;
  triggered_by: string | null;
  run_input: unknown;
  status: WorkflowRunStatus;
  error: string | null;
  autonomy_level: AutonomyLevel;
  started_at: string | null;
  finished_at: string | null;
};

type ApprovalRow = {
  id: string;
  step_id: string;
  kind: "checkpoint" | "write";
  pending_action: unknown;
  status: "pending" | "approved" | "denied" | "resolving";
  decided_by: string | null;
};

/**
 * A step's input or output, rendered readably: a quiet caption label, prose
 * for agent text, mono for structured tool data, and a disclosure for long
 * content so the timeline stays scannable. Renders nothing for empty values.
 */
function ValueBlock({ label, rendered }: { label: string; rendered: RenderedValue | null }) {
  if (!rendered) return null;

  const body = (
    <div className="rounded-lg border border-border bg-paper-2 px-3.5 py-3">
      <p
        className={cn(
          "whitespace-pre-wrap break-words",
          rendered.format === "json"
            ? "font-mono text-[12px] leading-[1.6] text-foreground/90"
            : "text-[13px] leading-[1.55] text-foreground/90",
        )}
      >
        {rendered.text}
      </p>
    </div>
  );

  if (rendered.text.length <= LONG_VALUE_THRESHOLD) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
          {label}
        </p>
        {body}
      </div>
    );
  }

  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded font-mono text-[11px] uppercase tracking-[0.05em] text-caption transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        {label} · {rendered.text.length.toLocaleString("en-US")} characters ·{" "}
        <span className="group-open:hidden">show</span>
        <span className="hidden group-open:inline">hide</span>
      </summary>
      <div className="mt-1.5">{body}</div>
    </details>
  );
}

/**
 * The run view (Workflows arc, Step 4b): the observability and audit surface
 * for one workflow run. Renders the run's persisted state — header, the
 * step-by-step timeline (the immutable workflow_step_runs audit trail merged
 * with the run's frozen definition snapshot), and, when the run is paused, the
 * approval card. The run executes server-side inside the start/decide actions;
 * a non-terminal run mounts a quiet poll (RunAutoRefresh) so the page updates
 * without a manual reload. RLS scopes the page: the run's owner and org admins
 * can see it; only the owner can decide.
 */
export default async function WorkflowRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  await requireAuthUser();
  const profile = await getCurrentUserProfile();
  if (!profile) notFound();

  const { runId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: runData } = await supabase
    .from("workflow_runs")
    .select(
      "id, workflow_definition_id, definition_snapshot, triggered_by, run_input, status, error, autonomy_level, started_at, finished_at",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!runData) notFound();
  const run = runData as RunRow;

  // The frozen snapshot is the source of truth for what this run executes —
  // immutable to later edits (and even deletion) of the definition.
  const definition = asWorkflowDefinition(run.definition_snapshot);
  const snapshotSteps = Array.isArray(definition.steps) ? definition.steps : [];
  const agentIds = [
    ...new Set(
      snapshotSteps.filter((s) => s.type === "agent").map((s) => s.agentId),
    ),
  ];

  const [defRes, stepsRes, approvalsRes, agentsRes] = await Promise.all([
    run.workflow_definition_id
      ? supabase
          .from("workflow_definitions")
          .select("name")
          .eq("id", run.workflow_definition_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("workflow_step_runs")
      .select(
        "step_id, step_type, status, input, output, error, approval_mode, sequence, started_at, finished_at",
      )
      .eq("workflow_run_id", run.id)
      .order("sequence", { ascending: true }),
    supabase
      .from("workflow_pending_approvals")
      .select("id, step_id, kind, pending_action, status, decided_by")
      .eq("workflow_run_id", run.id)
      .order("created_at", { ascending: true }),
    agentIds.length > 0
      ? supabase.from("agents").select("id, name").in("id", agentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const workflowName =
    (defRes.data as { name: string } | null)?.name ?? "Workflow run";
  const stepRows = (stepsRes.data ?? []) as StepRunRow[];
  const approvals = (approvalsRes.data ?? []) as ApprovalRow[];
  const agentNameById = new Map(
    ((agentsRes.data ?? []) as Array<{ id: string; name: string }>).map((a) => [
      a.id,
      a.name,
    ]),
  );

  // Display names for the run's people (the triggerer; whoever decided each
  // approval). The viewer reads as "you".
  const userIds = [
    ...new Set(
      [run.triggered_by, ...approvals.map((a) => a.decided_by)].filter(
        (v): v is string => Boolean(v) && v !== profile.id,
      ),
    ),
  ];
  const { data: userRows } =
    userIds.length > 0
      ? await supabase.from("users").select("id, full_name, email").in("id", userIds)
      : { data: [] };
  const nameById = new Map(
    ((userRows ?? []) as Array<{ id: string; full_name: string | null; email: string }>).map(
      (u) => [u.id, u.full_name?.trim() || u.email],
    ),
  );

  // Settled decisions, keyed by step — the "who cleared this?" provenance.
  const decisionByStepId = new Map<string, StepDecision>();
  for (const approval of approvals) {
    if (approval.status !== "approved" && approval.status !== "denied") continue;
    decisionByStepId.set(approval.step_id, {
      decision: approval.status,
      deciderName: approval.decided_by
        ? (nameById.get(approval.decided_by) ?? null)
        : null,
      deciderIsViewer: approval.decided_by === profile.id,
    });
  }

  const timeline = deriveTimeline(snapshotSteps, stepRows, run.status, agentNameById);
  const isOwner = run.triggered_by === profile.id;
  const isTerminal =
    run.status === "completed" || run.status === "failed" || run.status === "cancelled";

  // The open approval this run is paused on, prepared PII-safely for the card.
  const pending =
    run.status === "awaiting_approval"
      ? approvals.find((a) => a.status === "pending")
      : undefined;
  let pendingPrompt: string | null = null;
  let pendingWrite: {
    full: string;
    server: string | null;
    action: string;
    argKeys: string[];
  } | null = null;
  if (pending) {
    if (pending.kind === "write") {
      const action = pending.pending_action as {
        route?: { serverId?: string; originalToolName?: string };
        toolInput?: unknown;
      } | null;
      const label = pendingWriteToolLabel(
        action?.route?.serverId ?? "",
        action?.route?.originalToolName ?? "",
      );
      pendingWrite = {
        full: label.full,
        server: label.server,
        action: label.action,
        argKeys: pendingWriteArgKeys(action?.toolInput),
      };
    } else {
      pendingPrompt =
        ((pending.pending_action as { prompt?: string } | null)?.prompt ?? null);
    }
  }

  const startedByLabel = isOwner
    ? "you"
    : (run.triggered_by && nameById.get(run.triggered_by)) || "a teammate";
  const headerMeta = [
    `Started by ${startedByLabel}`,
    AUTONOMY_LABEL[run.autonomy_level],
    run.started_at ? `Started ${formatRunTimestamp(run.started_at)}` : null,
    run.finished_at
      ? `Finished ${formatRunTimestamp(run.finished_at)}${
          formatDuration(run.started_at, run.finished_at)
            ? ` (${formatDuration(run.started_at, run.finished_at)})`
            : ""
        }`
      : null,
  ].filter(Boolean);

  return (
    <main className="flex w-full max-w-3xl flex-col gap-8">
      {!isTerminal ? <RunAutoRefresh /> : null}

      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
          Workflow run
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            {workflowName}
          </h1>
          <StatusDotPill
            label={RUN_STATUS_LABEL[run.status]}
            tone={runStatusTone(run.status)}
            pulse={statusPulses(run.status)}
          />
        </div>
        <p className="mt-[14px] text-[13.5px] leading-[1.5] text-muted-foreground">
          {headerMeta.join(" · ")}
        </p>
      </header>

      {run.status === "failed" ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          This run failed{run.error ? `: ${run.error}` : "."}
        </div>
      ) : null}
      {run.status === "cancelled" ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-[13.5px] leading-[1.5] text-muted-foreground">
          This run was stopped by a deny. Everything that ran before the denial is
          recorded below; nothing after it was performed.
        </p>
      ) : null}

      {pending ? (
        <RunApprovalCard
          pendingApprovalId={pending.id}
          kind={pending.kind}
          prompt={pendingPrompt}
          write={pendingWrite}
          canDecide={isOwner}
        />
      ) : null}

      <ValueBlock label="Run input" rendered={renderRunValue(run.run_input)} />

      <section className="flex flex-col gap-4" aria-label="Step timeline">
        <h2 className="text-[17px] font-medium tracking-[-0.012em] text-foreground">
          Steps
        </h2>
        <ol className="flex flex-col gap-3">
          {timeline.map((entry) => {
            const provenance = stepProvenanceLabel(
              entry.approvalMode,
              decisionByStepId.get(entry.stepId) ?? null,
            );
            const duration = formatDuration(entry.startedAt, entry.finishedAt);
            const input = renderRunValue(entry.input);
            // A checkpoint's persisted output is the prior step's value passed
            // through (not new work product); rendering it would duplicate the
            // previous step's output in the trail.
            const output =
              entry.stepType === "human_checkpoint" ? null : renderRunValue(entry.output);
            const notReached = entry.status === "pending" || entry.status === "not_run";
            const footer = [
              provenance,
              entry.startedAt ? `Started ${formatRunTimestamp(entry.startedAt)}` : null,
              duration,
            ].filter(Boolean);

            return (
              <li
                key={entry.stepId}
                className={cn(
                  "rounded-[14px] border border-border bg-card p-5",
                  notReached && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-medium text-muted-foreground">
                      {entry.index + 1}
                    </span>
                    <div>
                      <p className="text-[14px] font-medium leading-[1.3] text-foreground">
                        {entry.name}
                      </p>
                      <p className="text-[12px] text-muted-foreground">{entry.typeLabel}</p>
                    </div>
                  </div>
                  <StatusDotPill
                    label={STEP_STATUS_LABEL[entry.status]}
                    tone={stepStatusTone(entry.status)}
                    pulse={statusPulses(entry.status)}
                    className="mt-1 shrink-0"
                  />
                </div>

                {entry.error ? (
                  <p className="mt-3 text-[13px] leading-[1.5] text-destructive">
                    {entry.error}
                  </p>
                ) : null}

                {input || output ? (
                  <div className="mt-4 flex flex-col gap-3">
                    <ValueBlock label="Input" rendered={input} />
                    <ValueBlock label="Output" rendered={output} />
                  </div>
                ) : null}

                {footer.length > 0 ? (
                  <p className="mt-3.5 text-[12px] text-muted-foreground">
                    {footer.join(" · ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {run.workflow_definition_id ? (
        <footer className="border-t border-border pt-5">
          <Link
            href={`/workspace/workflows/my-workflows/${run.workflow_definition_id}/run`}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            View this workflow and its other runs
          </Link>
        </footer>
      ) : null}
    </main>
  );
}
