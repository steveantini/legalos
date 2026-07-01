import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import {
  resumeAgent,
  runAgent,
  type RunAgentPauseState,
  type RunnableAgent,
} from "@/lib/agents/run-agent";
import { resolveOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import { executeMcpTool } from "@/lib/connections/mcp/execute-tool";
import { classifyMcpTool } from "@/lib/connections/mcp/tool-classification";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resumeWorkflow,
  runWorkflow,
  type AgentStepOutcome,
  type ResolveContext,
  type ToolActionOutcome,
  type WorkflowEngineDeps,
} from "@/lib/workflows/engine";
import { composeAgentTask } from "@/lib/workflows/agent-task";
import {
  asWorkflowDefinition,
  validateWorkflowDefinition,
} from "@/lib/workflows/validate";
import type {
  AgentStep,
  AutonomyLevel,
  PendingAgentWriteAction,
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
 * Delight pass D2: an AGENT step runs the pausable loop (writes "pause"), so the
 * agent itself can PROPOSE a write — the run pauses with the agent's resumable
 * state + the full proposed action persisted (kind 'agent_write'), and the
 * decision resumes the agent's loop: approve executes the write once and the
 * agent continues (possibly pausing again); deny lets the agent finish
 * gracefully and the RUN CONTINUES (unlike a tool_action deny, which cancels).
 * Every step now persists its PII-safe tool-call trace (workflow_step_runs.
 * tool_calls, migration 0062), closing the agent-step audit gap.
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

  /** Load + scope the runnable agent row a step points at (RLS applies). */
  async function loadRunnableAgent(agentId: string): Promise<RunnableAgent | null> {
    const { data: agentRow, error } = await supabase
      .from("agents")
      .select("id, system_prompt, model, tools_enabled, type, is_active")
      .eq("id", agentId)
      .maybeSingle();
    if (
      error ||
      !agentRow ||
      agentRow.type !== "native" ||
      !agentRow.is_active ||
      !agentRow.system_prompt ||
      !agentRow.model
    ) {
      return null;
    }
    return {
      id: agentRow.id,
      system_prompt: agentRow.system_prompt,
      model: agentRow.model,
      tools_enabled: (agentRow.tools_enabled as string[] | null) ?? null,
    };
  }

  return {
    runAgentStep: async (step: AgentStep, input: string): Promise<AgentStepOutcome> => {
      const agent = await loadRunnableAgent(step.agentId);
      if (!agent) {
        return { kind: "executed", ok: false, output: null, error: "The step's agent is not available." };
      }
      // writes "pause" (D2): the agent may PROPOSE a write — the loop pauses
      // and the engine turns it into a pending approval. Nothing executes.
      // The user message composes the step's optional plain-language
      // instruction with the mapped input (D3); no instruction → the mapped
      // input alone, byte-identical to pre-D3. The audit trail keeps the
      // mapped input as the step's recorded input (the instruction is already
      // in the run's definition snapshot).
      const res = await runAgent({
        agent,
        organizationId,
        userId,
        input: composeAgentTask(step.instruction, input),
        options: { workflowRunId, writes: "pause" },
      });
      // Check `paused` FIRST (D1's contract: the paused variant degrades to a
      // typed failure for pause-unaware callers — this caller is aware).
      if (res.paused) {
        return {
          kind: "needs_approval",
          pendingAction: {
            pendingWrite: res.paused.pendingWrite,
            pauseState: res.paused.pauseState,
          },
          toolCalls: res.toolCalls,
        };
      }
      return res.ok
        ? { kind: "executed", ok: true, output: res.output, toolCalls: res.toolCalls }
        : { kind: "executed", ok: false, output: null, error: res.error, toolCalls: res.toolCalls };
    },

    resumeAgentStep: async (
      step: AgentStep,
      pendingAction: PendingAgentWriteAction,
      decision: "approve" | "deny",
    ): Promise<AgentStepOutcome> => {
      const agent = await loadRunnableAgent(step.agentId);
      if (!agent) {
        return { kind: "executed", ok: false, output: null, error: "The step's agent is not available." };
      }
      const res = await resumeAgent({
        agent,
        organizationId,
        userId,
        pauseState: pendingAction.pauseState as RunAgentPauseState,
        pendingWrite: pendingAction.pendingWrite,
        decision,
        options: { workflowRunId },
      });
      if (res.paused) {
        return {
          kind: "needs_approval",
          pendingAction: {
            pendingWrite: res.paused.pendingWrite,
            pauseState: res.paused.pauseState,
          },
          toolCalls: res.toolCalls,
        };
      }
      return res.ok
        ? { kind: "executed", ok: true, output: res.output, toolCalls: res.toolCalls }
        : { kind: "executed", ok: false, output: null, error: res.error, toolCalls: res.toolCalls };
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

/** Map a step record to its workflow_step_runs columns, with or without the trace. */
function stepRunRow(
  workflowRunId: string,
  s: StepRunRecord,
  includeTrace: boolean,
): Record<string, unknown> {
  return {
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
    ...(includeTrace ? { tool_calls: s.toolCalls ?? null } : {}),
  };
}

/** Insert a batch of step-run rows (the immutable audit trail) for a run. */
async function insertStepRuns(
  supabase: SupabaseServerClient,
  workflowRunId: string,
  steps: StepRunRecord[],
): Promise<void> {
  if (steps.length === 0) return;
  const { error } = await supabase
    .from("workflow_step_runs")
    .insert(steps.map((s) => stepRunRow(workflowRunId, s, true)));
  if (error) {
    // 42703 = undefined_column: tool_calls (migration 0062) not applied yet.
    // Retry without the trace so the core audit rows still record (the same
    // degradation pattern usage_events uses for late columns).
    if (error.code === "42703") {
      const { error: retryErr } = await supabase
        .from("workflow_step_runs")
        .insert(steps.map((s) => stepRunRow(workflowRunId, s, false)));
      if (retryErr) {
        console.error("workflow_step_runs insert failed", { code: retryErr.code });
      }
      return;
    }
    console.error("workflow_step_runs insert failed", { code: error.code });
  }
}

/**
 * Persist a pending approval for a paused run. Token_ref pointers only, never a
 * token: a write's route, and an agent_write's pendingWrite route, both carry
 * the pointer that executeMcpTool re-resolves live on resume. An agent_write's
 * pending_action also carries the agent's resumable loop state (the owner's own
 * run data — same trust boundary as mcp_paused_runs.loop_state).
 */
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
      : pending.kind === "agent_write"
        ? {
            pendingWrite: pending.pendingAction.pendingWrite,
            pauseState: pending.pendingAction.pauseState,
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

/**
 * Interactive run entry (v1: manual start). Resolves the caller's identity from
 * the cookie session and delegates to the headless core `executeWorkflowRunWith`.
 *
 * BEHAVIOR-PRESERVING (D-220): this is byte-for-byte the same observable behavior
 * as the pre-D-220 inlined version — the same return shape, the same error
 * branches (including `unauthenticated`, returned BEFORE any DB client is
 * created), the same op ordering, and the same never-throws contract (the outer
 * try/catch still turns a thrown identity/client-resolution error into
 * internal_error, exactly as the original single catch did).
 */
export async function executeWorkflowRun(params: {
  definitionId: string;
  runInput: unknown;
  autonomyLevel?: AutonomyLevel;
}): Promise<WorkflowRunResult> {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile || !profile.organization_id) {
      return { ok: false, error: "unauthenticated" };
    }
    const supabase = await createSupabaseServerClient();
    return await executeWorkflowRunWith({
      supabase,
      organizationId: profile.organization_id,
      userId: profile.id,
      definitionId: params.definitionId,
      runInput: params.runInput,
      autonomyLevel: params.autonomyLevel,
    });
  } catch (err) {
    console.error("executeWorkflowRun failed", err);
    return { ok: false, error: "internal_error" };
  }
}

/**
 * Headless run core (D-220): execute a workflow run given an already-resolved DB
 * client + identity, so a caller with NO request session can drive a run exactly
 * as the interactive path does. This is the reusable seam the watcher arc's
 * scheduled-run cron (Stage 1) hangs off: it resolves the schedule's org + human
 * owner and passes a service-role client with `userId = owner_user_id` (option
 * 2c). Because the run's `triggered_by` is that human owner, the EXISTING
 * owner-scoped RLS admits their pause/approve/resume/read with ZERO policy change.
 *
 * `supabase` is the client every read + write in the run flows through: the cookie
 * (RLS-enforced) client for the interactive path, or the service-role client for
 * the headless path — which bypasses RLS and therefore scopes the org itself, via
 * the passed `organizationId` and the definition fetch below. Everything BELOW
 * this seam (the pure engine, runAgent, resolveOrgMcpTools, executeMcpTool) is
 * unchanged and already takes explicit org/user arguments.
 *
 * Never throws: any failure resolves to a typed { ok: false, error }.
 */
export async function executeWorkflowRunWith(params: {
  supabase: SupabaseServerClient;
  organizationId: string;
  userId: string;
  definitionId: string;
  runInput: unknown;
  autonomyLevel?: AutonomyLevel;
}): Promise<WorkflowRunResult> {
  const { supabase, organizationId, userId, definitionId, runInput } = params;
  const autonomyLevel: AutonomyLevel = params.autonomyLevel ?? "supervised";

  let runId: string | null = null;

  try {
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
    const mcp = await resolveOrgMcpTools(organizationId);

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
    // `supabase` is a guaranteed param here; runId is set only after the run row
    // inserts, so this mirrors the pre-D-220 `if (runId && supabase)` cleanup.
    if (runId) {
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

    const mcp = await resolveOrgMcpTools(organizationId);
    const deps = buildEngineDeps({ supabase, organizationId, userId, workflowRunId: run.id, mcp });

    const pendingAction =
      pending.kind === "write"
        ? (pending.pending_action as PendingWriteAction)
        : null;
    const pendingAgentAction =
      pending.kind === "agent_write"
        ? (pending.pending_action as PendingAgentWriteAction)
        : null;

    const result = await resumeWorkflow({
      definition,
      autonomy,
      deps,
      pausedIndex,
      pausedKind: pending.kind as "checkpoint" | "write" | "agent_write",
      pendingAction,
      pendingAgentAction,
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

    // Update the paused step's row to its settled state (+ approval provenance
    // + the refreshed tool-call trace). An agent step that paused AGAIN stays
    // awaiting_approval here, its trace now showing the decided write.
    if (result.pausedStepRecord) {
      const s = result.pausedStepRecord;
      const settled = {
        status: s.status,
        output: s.output ?? null,
        error: s.error,
        approval_mode: s.approvalMode,
        finished_at: s.finishedAt,
      };
      const { error: updStepErr } = await supabase
        .from("workflow_step_runs")
        .update({ ...settled, tool_calls: s.toolCalls ?? null })
        .eq("workflow_run_id", run.id)
        .eq("step_id", s.stepId);
      if (updStepErr) {
        // 42703: tool_calls (migration 0062) not applied yet — retry without
        // the trace so the step still settles.
        if (updStepErr.code === "42703") {
          const { error: retryErr } = await supabase
            .from("workflow_step_runs")
            .update(settled)
            .eq("workflow_run_id", run.id)
            .eq("step_id", s.stepId);
          if (retryErr) {
            console.error("workflow_step_runs resume update failed", { code: retryErr.code });
          }
        } else {
          console.error("workflow_step_runs resume update failed", { code: updStepErr.code });
        }
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
