import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import { runAgent, type RunnableAgent } from "@/lib/agents/run-agent";
import { resolveOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import { executeMcpTool } from "@/lib/connections/mcp/execute-tool";
import { classifyMcpTool } from "@/lib/connections/mcp/tool-classification";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  runWorkflow,
  type StepExecResult,
  type WorkflowEngineDeps,
} from "@/lib/workflows/engine";
import {
  asWorkflowDefinition,
  validateWorkflowDefinition,
} from "@/lib/workflows/validate";
import type { AgentStep, ToolActionStep } from "@/lib/workflows/types";

/**
 * The I/O wrapper around the pure workflow engine (Workflows arc, Step 2): the
 * server-side entry point that starts a run from a stored definition, wires the
 * real step resolvers (agent loading + runAgent; governed MCP tool execution),
 * and persists the run + its immutable per-step audit trail.
 *
 * Request-context governance (v1, manual run): the same user-scoped RLS path
 * runAgent uses. Reads/writes go through the user-scoped Supabase client so RLS
 * stays the last line of defense; the MCP governance is resolved once up front
 * (isCategoryAllowed ∩ connected+healthy) and reused for the whole run. A future
 * scheduled/headless trigger will need an admin-client policy-read variant — not
 * now (consistent with runAgent's Step 1 note).
 *
 * Never throws: any failure resolves to a typed { ok: false, error }.
 */

export type WorkflowRunResult =
  | {
      ok: true;
      runId: string;
      status: "completed" | "failed" | "awaiting_approval";
    }
  | { ok: false; error: string; errors?: string[] };

export async function executeWorkflowRun(params: {
  definitionId: string;
  runInput: unknown;
}): Promise<WorkflowRunResult> {
  const { definitionId, runInput } = params;

  let runId: string | null = null;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;

  try {
    const profile = await getCurrentUserProfile();
    if (!profile || !profile.organization_id) {
      return { ok: false, error: "unauthenticated" };
    }
    const organizationId = profile.organization_id;
    const userId = profile.id;

    supabase = await createSupabaseServerClient();

    // ---- Load the definition (RLS scopes to the user's org / dept access).
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

    // Resolve the org's governed MCP tools ONCE — the same snapshot validates the
    // definition (classifyTool) and executes its tool_action steps (route lookup).
    const mcp = await resolveOrgMcpTools();

    // ---- Re-validate at the data boundary with LIVE resolvers. This is the same
    // gate a future agent-emitted definition would pass; registries may have
    // changed since authoring, so a stale definition is rejected before any run.
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

    // ---- Snapshot the definition into the run, so later edits never mutate it.
    const nowStart = new Date().toISOString();
    const { data: runRow, error: runErr } = await supabase
      .from("workflow_runs")
      .insert({
        workflow_definition_id: definitionId,
        definition_snapshot: definition,
        organization_id: organizationId,
        triggered_by: userId,
        run_input: runInput ?? null,
        status: "running",
        started_at: nowStart,
      })
      .select("id")
      .single();
    if (runErr || !runRow) {
      console.error("workflow_runs insert failed", { code: runErr?.code });
      return { ok: false, error: "internal_error" };
    }
    const id: string = runRow.id;
    runId = id;

    // ---- Wire the real step resolvers.
    const deps: WorkflowEngineDeps = {
      runAgentStep: async (step: AgentStep, input: string): Promise<StepExecResult> => {
        const { data: agentRow, error: agentErr } = await supabase!
          .from("agents")
          .select("id, system_prompt, model, tools_enabled, type, is_active")
          .eq("id", step.agentId)
          .maybeSingle();
        if (
          agentErr ||
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
          options: { workflowRunId: runId ?? undefined },
        });
        return res.ok
          ? { ok: true, output: res.output }
          : { ok: false, output: null, error: res.error };
      },

      runToolActionStep: async (
        step: ToolActionStep,
        args: Record<string, unknown>,
      ): Promise<StepExecResult> => {
        const target = mcp.targets.find((t) => t.serverId === step.serverId);
        const descriptor = target?.tools?.find((d) => d.name === step.toolName);
        if (!target || !descriptor) {
          return { ok: false, output: null, error: "The tool action is not available." };
        }
        // Defense in depth: the validator already rejected write tool_actions, but
        // never execute a non-read tool unattended even if a definition slipped through.
        if (classifyMcpTool(descriptor) !== "read") {
          return { ok: false, output: null, error: "Write tool actions are not allowed." };
        }
        const route: McpToolRoute = {
          serverId: target.serverId,
          connectionId: target.connectionId,
          tokenRef: target.tokenRef,
          serverUrl: target.serverUrl,
          originalToolName: descriptor.name,
        };
        const exec = await executeMcpTool({
          route,
          toolInput: args,
          toolUseId: crypto.randomUUID(),
        });
        return exec.trace.status === "ok"
          ? { ok: true, output: exec.toolResult.content }
          : {
              ok: false,
              output: null,
              error: exec.trace.errorMessage ?? exec.trace.errorCode ?? "The tool action failed.",
            };
      },

      nowIso: () => new Date().toISOString(),
    };

    // ---- Walk the snapshot (NOT the live definition) so the run is immutable to edits.
    const outcome = await runWorkflow(asWorkflowDefinition(definition), runInput ?? null, deps);

    // ---- Persist one immutable row per executed step (the audit trail).
    if (outcome.steps.length > 0) {
      const { error: stepErr } = await supabase.from("workflow_step_runs").insert(
        outcome.steps.map((s) => ({
          workflow_run_id: runId,
          step_id: s.stepId,
          step_type: s.stepType,
          status: s.status,
          input: s.input ?? null,
          output: s.output ?? null,
          error: s.error,
          sequence: s.sequence,
          started_at: s.startedAt,
          finished_at: s.finishedAt,
        })),
      );
      if (stepErr) {
        console.error("workflow_step_runs insert failed", { code: stepErr.code });
      }
    }

    // ---- Settle the run status. An awaiting_approval run is NOT finished (Step 3
    // resumes it), so it keeps a null finished_at.
    const { error: updErr } = await supabase
      .from("workflow_runs")
      .update({
        status: outcome.status,
        error: outcome.error,
        finished_at: outcome.status === "awaiting_approval" ? null : new Date().toISOString(),
      })
      .eq("id", runId);
    if (updErr) {
      console.error("workflow_runs status update failed", { code: updErr.code });
    }

    return { ok: true, runId: id, status: outcome.status };
  } catch (err) {
    console.error("executeWorkflowRun failed", err);
    // Best-effort: mark a created run failed so it isn't stuck 'running'.
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
