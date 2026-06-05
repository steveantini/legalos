import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import { runAgent, type RunnableAgent } from "@/lib/agents/run-agent";
import { resolveOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import { executeMcpTool } from "@/lib/connections/mcp/execute-tool";
import { classifyMcpTool } from "@/lib/connections/mcp/tool-classification";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resumeWorkflow,
  runWorkflow,
  type ResolveContext,
  type StepExecResult,
  type ToolActionOutcome,
  type WorkflowEngineDeps,
} from "@/lib/workflows/engine";
import {
  asWorkflowDefinition,
  validateWorkflowDefinition,
} from "@/lib/workflows/validate";
import type {
  AgentStep,
  AutonomyLevel,
  PendingApproval,
  PendingWriteAction,
  StepRunRecord,
  ToolActionStep,
} from "@/lib/workflows/types";

/**
 * The I/O wrapper around the pure workflow engine (Workflows arc, Steps 2-3):
 * starts a run from a stored definition, wires the real step resolvers, persists
 * the immutable per-step audit trail, and — when the run pauses for a human
 * decision — persists a pending approval and resumes the run on the decision.
 *
 * The durable pause/resume generalizes the proven Phase 2 chat write-confirmation
 * pattern to workflow runs: a write's pending state stores only a token_ref (never
 * a token), and the resume re-resolves a live token through executeMcpTool. The
 * decision uses an ATOMIC pending→resolving claim, so an approved write executes
 * at most once. NO write ever runs without a human approval (v1, any autonomy mode).
 *
 * Request-context governance (v1, manual run + manual decide): the same
 * user-scoped RLS path runAgent uses, with the org's MCP governance resolved once
 * per request (isCategoryAllowed ∩ connected+healthy).
 *
 * Never throws: any failure resolves to a typed { ok: false, error }.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type WorkflowRunResult =
  | {
      ok: true;
      runId: string;
      status: "completed" | "failed" | "awaiting_approval" | "cancelled";
    }
  | { ok: false; error: string; errors?: string[] };

/**
 * Build the engine resolvers for a run. `mcp` is the org's governed tool snapshot
 * (resolved once per request). A write tool_action resolves its route + returns
 * `needs_approval` WITHOUT executing; a read executes inline.
 */
function buildEngineDeps(args: {
  supabase: SupabaseServerClient;
  organizationId: string;
  userId: string;
  workflowRunId: string;
  mcp: Awaited<ReturnType<typeof resolveOrgMcpTools>>;
}): WorkflowEngineDeps {
  const { supabase, organizationId, userId, workflowRunId, mcp } = args;
  return {
    runAgentStep: async (step: AgentStep, input: string): Promise<StepExecResult> => {
      const { data: agentRow, error } = await supabase
        .from("agents")
        .select("id, system_prompt, model, tools_enabled, type, is_active")
        .eq("id", step.agentId)
        .maybeSingle();
      if (
        error ||
        !agentRow ||
        agentRow.type !== "native" ||
        !agentRow.is_active ||
        !agentRow.system_prompt ||
        !agentRow.model
      ) {
        return { ok: false, output: null, error: "The step's agent is not available." };
      }
      const agent: RunnableAgent = {
        id: agentRow.id,
        system_prompt: agentRow.system_prompt,
        model: agentRow.model,
        tools_enabled: (agentRow.tools_enabled as string[] | null) ?? null,
      };
      const res = await runAgent({
        agent,
        organizationId,
        userId,
        input,
        options: { workflowRunId },
      });
      return res.ok ? { ok: true, output: res.output } : { ok: false, output: null, error: res.error };
    },

    runToolActionStep: async (
      step: ToolActionStep,
      stepArgs: Record<string, unknown>,
    ): Promise<ToolActionOutcome> => {
      const target = mcp.targets.find((t) => t.serverId === step.serverId);
      const descriptor = target?.tools?.find((d) => d.name === step.toolName);
      if (!target || !descriptor) {
        return { kind: "executed", ok: false, output: null, error: "The tool action is not available." };
      }
      const route: McpToolRoute = {
        serverId: target.serverId,
        connectionId: target.connectionId,
        tokenRef: target.tokenRef,
        serverUrl: target.serverUrl,
        originalToolName: descriptor.name,
      };
      // WRITE: do NOT execute — pause for approval. token_ref travels in the route
      // (never a token); the approved write executes on resume.
      if (classifyMcpTool(descriptor) !== "read") {
        return {
          kind: "needs_approval",
          pendingAction: { route, toolInput: stepArgs, toolUseId: crypto.randomUUID() },
        };
      }
      const exec = await executeMcpTool({ route, toolInput: stepArgs, toolUseId: crypto.randomUUID() });
      return exec.trace.status === "ok"
        ? { kind: "executed", ok: true, output: exec.toolResult.content }
        : {
            kind: "executed",
            ok: false,
            output: null,
            error: exec.trace.errorMessage ?? exec.trace.errorCode ?? "The tool action failed.",
          };
    },

    nowIso: () => new Date().toISOString(),
  };
}

/** Insert a batch of step-run rows (the immutable audit trail) for a run. */
async function insertStepRuns(
  supabase: SupabaseServerClient,
  workflowRunId: string,
  steps: StepRunRecord[],
): Promise<void> {
  if (steps.length === 0) return;
  const { error } = await supabase.from("workflow_step_runs").insert(
    steps.map((s) => ({
      workflow_run_id: workflowRunId,
      step_id: s.stepId,
      step_type: s.stepType,
      status: s.status,
      input: s.input ?? null,
      output: s.output ?? null,
      error: s.error,
      approval_mode: s.approvalMode,
      sequence: s.sequence,
      started_at: s.startedAt,
      finished_at: s.finishedAt,
    })),
  );
  if (error) {
    console.error("workflow_step_runs insert failed", { code: error.code });
  }
}

/** Persist a pending approval for a paused run (token_ref only for a write). */
async function insertPendingApproval(
  supabase: SupabaseServerClient,
  workflowRunId: string,
  organizationId: string,
  pending: PendingApproval,
): Promise<void> {
  const pendingAction =
    pending.kind === "write"
      ? {
          route: pending.pendingAction.route,
          toolInput: pending.pendingAction.toolInput,
          toolUseId: pending.pendingAction.toolUseId,
        }
      : { prompt: pending.prompt };
  const { error } = await supabase.from("workflow_pending_approvals").insert({
    workflow_run_id: workflowRunId,
    organization_id: organizationId,
    step_id: pending.stepId,
    sequence: pending.sequence,
    kind: pending.kind,
    pending_action: pendingAction,
    status: "pending",
  });
  if (error) {
    console.error("workflow_pending_approvals insert failed", { code: error.code });
  }
}

export async function executeWorkflowRun(params: {
  definitionId: string;
  runInput: unknown;
  autonomyLevel?: AutonomyLevel;
}): Promise<WorkflowRunResult> {
  const { definitionId, runInput } = params;
  const autonomyLevel: AutonomyLevel = params.autonomyLevel ?? "supervised";

  let runId: string | null = null;
  let supabase: SupabaseServerClient | null = null;

  try {
    const profile = await getCurrentUserProfile();
    if (!profile || !profile.organization_id) {
      return { ok: false, error: "unauthenticated" };
    }
    const organizationId = profile.organization_id;
    const userId = profile.id;

    supabase = await createSupabaseServerClient();

    const { data: defRow, error: defErr } = await supabase
      .from("workflow_definitions")
      .select("id, status, definition")
      .eq("id", definitionId)
      .maybeSingle();
    if (defErr) {
      console.error("workflow_definitions fetch failed", { code: defErr.code });
      return { ok: false, error: "internal_error" };
    }
    if (!defRow) return { ok: false, error: "not_found" };
    if (defRow.status !== "active") return { ok: false, error: "not_runnable" };

    const definition = defRow.definition;
    const mcp = await resolveOrgMcpTools();

    // Re-validate at the data boundary with LIVE resolvers (the same gate a future
    // agent-emitted definition passes). Write tool_actions are now permitted —
    // they are approval-gated at execution.
    const validation = await validateWorkflowDefinition(definition, {
      isAgentRunnable: async (agentId: string) => {
        const { data } = await supabase!
          .from("agents")
          .select("id")
          .eq("id", agentId)
          .eq("is_active", true)
          .eq("type", "native")
          .maybeSingle();
        return Boolean(data);
      },
      classifyTool: async (serverId: string, toolName: string) => {
        const target = mcp.targets.find((t) => t.serverId === serverId);
        const descriptor = target?.tools?.find((d) => d.name === toolName);
        return descriptor ? classifyMcpTool(descriptor) : null;
      },
    });
    if (!validation.ok) {
      return { ok: false, error: "invalid_definition", errors: validation.errors };
    }

    // Snapshot the definition into the run (immutable to later edits).
    const { data: runRow, error: runErr } = await supabase
      .from("workflow_runs")
      .insert({
        workflow_definition_id: definitionId,
        definition_snapshot: definition,
        organization_id: organizationId,
        triggered_by: userId,
        run_input: runInput ?? null,
        autonomy_level: autonomyLevel,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (runErr || !runRow) {
      console.error("workflow_runs insert failed", { code: runErr?.code });
      return { ok: false, error: "internal_error" };
    }
    const id: string = runRow.id;
    runId = id;

    const deps = buildEngineDeps({ supabase, organizationId, userId, workflowRunId: id, mcp });

    // Walk the SNAPSHOT (not the live definition) so the run is immutable to edits.
    const segment = await runWorkflow(asWorkflowDefinition(definition), runInput ?? null, deps, autonomyLevel);

    await insertStepRuns(supabase, id, segment.steps);

    if (segment.status === "awaiting_approval" && segment.pending) {
      await insertPendingApproval(supabase, id, organizationId, segment.pending);
    }

    await supabase
      .from("workflow_runs")
      .update({
        status: segment.status,
        error: segment.error,
        finished_at: segment.status === "awaiting_approval" ? null : new Date().toISOString(),
      })
      .eq("id", id);

    return { ok: true, runId: id, status: segment.status };
  } catch (err) {
    console.error("executeWorkflowRun failed", err);
    if (runId && supabase) {
      await supabase
        .from("workflow_runs")
        .update({
          status: "failed",
          error: "The run could not be completed.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return { ok: false, error: "internal_error" };
  }
}

/**
 * Record a decision on a pending workflow approval and resume the run (Step 3).
 * The atomic pending→resolving claim (inside resumeWorkflow) guarantees the
 * approved write executes at most once even on a double-approve.
 */
export async function resumeWorkflowApproval(params: {
  pendingApprovalId: string;
  decision: "approve" | "deny";
}): Promise<WorkflowRunResult> {
  const { pendingApprovalId, decision } = params;

  try {
    const profile = await getCurrentUserProfile();
    if (!profile || !profile.organization_id) {
      return { ok: false, error: "unauthenticated" };
    }
    const organizationId = profile.organization_id;
    const userId = profile.id;

    const supabase = await createSupabaseServerClient();

    // Load the pending approval (RLS scopes to the run's owner).
    const { data: pending, error: pendingErr } = await supabase
      .from("workflow_pending_approvals")
      .select("id, workflow_run_id, step_id, sequence, kind, pending_action, status")
      .eq("id", pendingApprovalId)
      .maybeSingle();
    if (pendingErr) {
      console.error("workflow_pending_approvals fetch failed", { code: pendingErr.code });
      return { ok: false, error: "internal_error" };
    }
    if (!pending) return { ok: false, error: "not_found" };
    if (pending.status !== "pending") return { ok: false, error: "already_decided" };

    // Load the run (RLS owner-scoped) — its frozen snapshot + autonomy drive resume.
    const { data: run, error: runErr } = await supabase
      .from("workflow_runs")
      .select("id, autonomy_level, run_input, definition_snapshot, organization_id")
      .eq("id", pending.workflow_run_id)
      .maybeSingle();
    if (runErr) {
      console.error("workflow_runs fetch failed", { code: runErr.code });
      return { ok: false, error: "internal_error" };
    }
    if (!run) return { ok: false, error: "not_found" };

    const definition = asWorkflowDefinition(run.definition_snapshot);
    const autonomy = (run.autonomy_level as AutonomyLevel) ?? "supervised";
    const pausedIndex: number = pending.sequence;

    // Reconstruct the value context from the run's completed step outputs.
    const { data: priorSteps } = await supabase
      .from("workflow_step_runs")
      .select("step_id, sequence, output")
      .eq("workflow_run_id", run.id)
      .eq("status", "completed")
      .order("sequence", { ascending: true });
    const prior = (priorSteps ?? []) as Array<{ step_id: string; sequence: number; output: unknown }>;
    const outputs = new Map<string, unknown>(prior.map((s) => [s.step_id, s.output]));
    const before = prior.filter((s) => s.sequence < pausedIndex);
    const previousOutput = before.length > 0 ? before[before.length - 1].output : run.run_input;
    const ctx: ResolveContext = { runInput: run.run_input, previousOutput, outputs };

    const mcp = await resolveOrgMcpTools();
    const deps = buildEngineDeps({ supabase, organizationId, userId, workflowRunId: run.id, mcp });

    const pendingAction =
      pending.kind === "write"
        ? (pending.pending_action as PendingWriteAction)
        : null;

    const result = await resumeWorkflow({
      definition,
      autonomy,
      deps,
      pausedIndex,
      pausedKind: pending.kind as "checkpoint" | "write",
      pendingAction,
      decision,
      ctx,
      // ATOMIC at-most-once claim: only the caller that flips pending→resolving wins.
      claimPaused: async () => {
        const { data } = await supabase
          .from("workflow_pending_approvals")
          .update({ status: "resolving", decided_by: userId, decided_at: new Date().toISOString() })
          .eq("id", pendingApprovalId)
          .eq("status", "pending")
          .select("id");
        return Array.isArray(data) && data.length === 1;
      },
      executeApprovedWrite: async (action: PendingWriteAction) => {
        const exec = await executeMcpTool({
          route: action.route,
          toolInput: action.toolInput,
          toolUseId: action.toolUseId,
        });
        return exec.trace.status === "ok"
          ? { ok: true, output: exec.toolResult.content }
          : {
              ok: false,
              output: null,
              error: exec.trace.errorMessage ?? exec.trace.errorCode ?? "The write failed.",
            };
      },
    });

    if (!result.claimed) {
      // Another approval already claimed this — at-most-once held.
      return { ok: false, error: "already_decided" };
    }

    // Update the paused step's row to its terminal state (+ approval provenance).
    if (result.pausedStepRecord) {
      const s = result.pausedStepRecord;
      const { error: updStepErr } = await supabase
        .from("workflow_step_runs")
        .update({
          status: s.status,
          output: s.output ?? null,
          error: s.error,
          approval_mode: s.approvalMode,
          finished_at: s.finishedAt,
        })
        .eq("workflow_run_id", run.id)
        .eq("step_id", s.stepId);
      if (updStepErr) {
        console.error("workflow_step_runs resume update failed", { code: updStepErr.code });
      }
    }

    // Insert any continuation step records, and a new pending approval if it
    // paused again.
    if (result.segment) {
      await insertStepRuns(supabase, run.id, result.segment.steps);
      if (result.segment.status === "awaiting_approval" && result.segment.pending) {
        await insertPendingApproval(supabase, run.id, organizationId, result.segment.pending);
      }
    }

    // Settle this approval (the decision is terminal even if a later step re-pauses).
    await supabase
      .from("workflow_pending_approvals")
      .update({ status: decision === "approve" ? "approved" : "denied" })
      .eq("id", pendingApprovalId);

    // Settle the run.
    const finished = result.runStatus !== "awaiting_approval";
    await supabase
      .from("workflow_runs")
      .update({
        status: result.runStatus,
        error: result.segment?.error ?? null,
        finished_at: finished ? new Date().toISOString() : null,
      })
      .eq("id", run.id);

    return { ok: true, runId: run.id, status: result.runStatus };
  } catch (err) {
    console.error("resumeWorkflowApproval failed", err);
    return { ok: false, error: "internal_error" };
  }
}
