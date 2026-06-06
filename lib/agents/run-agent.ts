import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import {
  assembleDecisionToolResult,
  executedWriteTraceFields,
  type ConfirmationDecision,
  type PendingMcpToolCall,
} from "@/lib/chat/mcp-confirmation";
import {
  resolveGatedOrgMcpTools,
  type GatedOrgMcpTools,
} from "@/lib/connections/mcp/agent-tools";
import {
  executeMcpTool,
  type McpToolExecution,
} from "@/lib/connections/mcp/execute-tool";
import type { McpToolAccess } from "@/lib/connections/mcp/tool-classification";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import {
  streamAnthropicChat,
  type AnthropicChatMessage,
  type AnthropicSystemBlock,
  type AnthropicTool,
  type AnthropicToolResultBlock,
} from "@/lib/llm/anthropic/chat";
import {
  MCP_LOOP_WALL_CLOCK_MS,
  MCP_MAX_TOOL_ROUNDS,
} from "@/lib/llm/anthropic/mcp-loop-guards";
import {
  buildSystemPrompt,
  wrapUserMessage,
} from "@/lib/llm/anthropic/prompt-defense";
import type { ChatToolCall } from "@/lib/llm/anthropic/stream";
import { resolveModelCredential } from "@/lib/llm/model-credential";
import { parseModelId } from "@/lib/llm/parse-model-id";
import { computeCostMicroUsd } from "@/lib/llm/pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Headless agent execution (Workflows arc Step 1; pausable writes added in the
 * delight pass D1).
 *
 * runAgent runs an agent's full agentic loop — model turn, governed MCP READ
 * tool calls, feed the results back, repeat — and returns the final result as a
 * value, with NO Server-Sent Events, NO conversation/message persistence, and NO
 * interactive user. It is the building block a workflow agent-step (Step 2) calls,
 * and the first programmatic entry point into agent execution that the
 * streaming chat route never exposed.
 *
 * It reuses the EXACT same governed ingredients chat uses — resolveModelCredential
 * (via the same path), buildSystemPrompt + wrapUserMessage, resolveGatedOrgMcpTools
 * (the same org governance + read/write classification), streamAnthropicChat +
 * finalMessage()/finalUsage() for the model turn, executeMcpTool for tool calls,
 * the same MCP_MAX_TOOL_ROUNDS / MCP_LOOP_WALL_CLOCK_MS guards, and computeCostMicroUsd
 * + usage_events for cost. Nothing about the model, tool, or governance logic is
 * reimplemented or forked.
 *
 * It does NOT share the chat route's outer orchestration. The streaming loop in
 * lib/chat/assistant-stream.ts is inseparable from SSE encoding, message
 * persistence, citation draining, and the Phase 2 write-confirmation pause/resume;
 * extracting it would risk regressing that pause/resume, which must stay
 * byte-identical. The headless loop here is a small, deliberately separate
 * orchestration over the same shared primitives — the conservative split the
 * task called for. See DECISION_LOG (Workflows arc Step 1).
 *
 * WRITE SAFETY (the one behavioral contract, two hosts — delight pass D1):
 * agents may PROPOSE writes; nothing executes without a human decision; the same
 * governed executor performs approved writes. Under the DEFAULT policy
 * (writes "refuse" — every pre-D1 caller), headless runs OFFER the model only
 * READ-classified MCP tools, and the loop refuses to execute any write tool_use
 * it somehow receives (belt and suspenders) — feeding back a "not performed"
 * result instead, exactly as before. Under the explicit OPT-IN policy
 * (writes "pause" — the workflow agent-step host, wired in D2), write tools ARE
 * offered, and the first write tool_use PAUSES the loop: it returns a resumable
 * state plus the full proposed action (the chat-shared PendingMcpToolCall shape)
 * for a human decision, mirroring the Phase 2 chat pause as a SIBLING of that
 * proven pattern. Either way, this module has NO write-execution path of its
 * own: a write runs only through the injected executor, and only on an approve
 * decision inside resumeAgentLoop — the structural no-unattended-write guarantee.
 */

/** The agent fields a run needs (a resolved row; the caller loads + scopes it). */
export type RunnableAgent = {
  id: string;
  system_prompt: string;
  /** Vendor-prefixed model id, e.g. 'anthropic/claude-opus-4-8'. */
  model: string;
  tools_enabled: string[] | null;
};

/**
 * How the loop treats a WRITE tool_use (delight pass D1):
 *   - "refuse" (DEFAULT — all pre-D1 callers, untouched): write tools are never
 *     offered, and a write that somehow arrives is refused with a "not
 *     performed" result; the loop continues.
 *   - "pause": write tools are offered, and the FIRST write tool_use pauses the
 *     loop for a human decision (the workflow agent-step host, D2).
 */
export type AgentWritePolicy = "refuse" | "pause";

export type RunAgentParams = {
  agent: RunnableAgent;
  organizationId: string;
  userId: string;
  /** The task the agent runs on (for a workflow step, the step's input). */
  input: string;
  options?: {
    /** Override the model⇄tool round cap (default MCP_MAX_TOOL_ROUNDS). */
    maxRounds?: number;
    /** Override the agent's model with another vendor-prefixed id. */
    model?: string;
    /** Set false to run with NO MCP tools at all (still honors web_search). */
    mcpToolsEnabled?: boolean;
    /** Write policy (default "refuse"; see AgentWritePolicy). */
    writes?: AgentWritePolicy;
    /**
     * The workflow run this agent-step belongs to (Workflows arc Step 2), recorded
     * on the usage_events row so workflow cost is traceable. Omitted for chat /
     * standalone runs (the column stays null).
     */
    workflowRunId?: string;
  };
};

/** Summed usage for a run; tokensIn/out and cost are the source of truth for billing. */
export type RunAgentUsage = {
  tokensIn: number;
  tokensOut: number;
  cacheCreation: number;
  cacheRead: number;
  webSearch: number;
  mcpToolCallCount: number;
  costMicroUsd: number;
};

/**
 * The resumable state of a paused loop — the chat LoopState shape minus its
 * SSE/persistence concerns. The host persists this verbatim (D2:
 * workflow_pending_approvals, mirroring mcp_paused_runs.loop_state) and
 * resumeAgentLoop re-seeds the loop from it. It is the owner's own run data
 * (model content blocks + the proposed write's input). NO tokens live here: the
 * pending write's route carries a token_ref POINTER only, re-resolved live by
 * the executor on resume.
 */
export type RunAgentPauseState = {
  /** Content-block messages so far, INCLUDING the paused assistant turn (last). */
  loopMessages: AnthropicChatMessage[];
  /** Tool results already produced for the paused turn (reads before the write). */
  partialToolResults: AnthropicToolResultBlock[];
  /** The tool_use id of the write awaiting a decision. */
  pendingToolUseId: string;
  /** Accumulated assistant text so far. */
  output: string;
  /** The PII-safe tool-call trace so far (argKeys only) — survives the pause. */
  toolCalls: ChatToolCall[];
  round: number;
  usage: Omit<RunAgentUsage, "costMicroUsd">;
};

/** A paused run, as surfaced through RunAgentResult. */
export type AgentRunPause = {
  /**
   * The write the agent proposed, in the SAME shape the chat pause persists
   * (lib/chat/mcp-confirmation.ts): toolUseId, namespaced name, the route
   * (token_ref pointer, never a token), the FULL tool input the agent chose
   * (Fork 2: kept at full fidelity so a later approval card CAN disclose what
   * will be sent), and the PII-safe argKeys for the default keys-only render.
   */
  pendingWrite: PendingMcpToolCall;
  pauseState: RunAgentPauseState;
};

/**
 * The result of a headless run. A discriminated union: a successful run carries
 * the final output; a failed run carries a safe error string; a PAUSED run
 * (writes "pause" only) carries the proposed write + resumable state. The
 * paused variant deliberately reads as `ok: false` with a typed error, so a
 * pause-UNAWARE caller degrades safely (treats it as a not-completed run and
 * performs nothing); pause-aware hosts check `paused` FIRST. Either way the
 * partial output/toolCalls/usage gathered so far are returned, and runAgent
 * NEVER throws (mirroring executeMcpTool's never-throws discipline).
 */
export type RunAgentResult =
  | {
      ok: true;
      paused?: undefined;
      output: string;
      toolCalls: ChatToolCall[];
      usage: RunAgentUsage;
      stopReason: string | null;
    }
  | {
      ok: false;
      paused?: undefined;
      error: string;
      output: string;
      toolCalls: ChatToolCall[];
      usage: RunAgentUsage;
      stopReason: string | null;
    }
  | {
      ok: false;
      paused: AgentRunPause;
      error: string;
      output: string;
      toolCalls: ChatToolCall[];
      usage: RunAgentUsage;
      stopReason: string | null;
    };

/** The error string a paused result carries for pause-unaware callers. */
export const AGENT_RUN_PAUSED_ERROR =
  "The run paused for approval of a proposed write action.";

/** The message fed back when the model requests a write under the refuse policy. */
const HEADLESS_WRITE_MESSAGE =
  "This action was not performed: write actions are not executed in an unattended run. Tell the caller what you would do and that it requires human approval.";

/** A token/PII-free summary of a tool call's arguments: sorted KEY NAMES only. */
function mcpArgsSummary(input: unknown): { argKeys: string[] } {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { argKeys: Object.keys(input as Record<string, unknown>).sort() };
  }
  return { argKeys: [] };
}

/** A minimal view of an assistant content block as iterated from a model turn. */
type ToolUseBlock = { type: string; id: string; name: string; input: unknown };

/** One model turn's outcome, as the loop consumes it (vendor-neutral shape). */
export type ModelTurnResult = {
  stopReason: string | null;
  content: Anthropic.Messages.ContentBlockParam[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    web_search_requests: number;
  };
};

/** Injected dependencies for the pure loop — real wiring in runAgent, fakes in tests. */
export type RunAgentLoopDeps = {
  baseMessages: AnthropicChatMessage[];
  /**
   * Tools OFFERED to the model: web_search + governed MCP defs. Under the
   * default refuse policy the caller includes READ defs only; a "pause" caller
   * includes write defs too (the loop pauses before any write executes).
   */
  offeredTools: AnthropicTool[];
  routingMap: Record<string, McpToolRoute>;
  accessByName: Map<string, McpToolAccess>;
  maxRounds: number;
  wallClockMs: number;
  now: () => number;
  /** Write policy (default "refuse"; see AgentWritePolicy). */
  writes?: AgentWritePolicy;
  modelTurn: (
    messages: AnthropicChatMessage[],
    tools: AnthropicTool[] | undefined,
  ) => Promise<ModelTurnResult>;
  toolExec: (params: {
    route: McpToolRoute;
    toolInput: unknown;
    toolUseId: string;
  }) => Promise<McpToolExecution>;
};

export type RunAgentLoopResult = {
  output: string;
  toolCalls: ChatToolCall[];
  usage: Omit<RunAgentUsage, "costMicroUsd">;
  stopReason: string | null;
};

/**
 * A loop invocation's outcome: completed, or paused on a proposed write. Both
 * variants carry the output/trace/usage gathered so far, so completed-path
 * consumers read them uniformly and a paused outcome still reports its partials.
 */
export type RunAgentLoopOutcome =
  | ({
      status: "completed";
      pendingWrite?: undefined;
      pauseState?: undefined;
    } & RunAgentLoopResult)
  | {
      status: "paused";
      pendingWrite: PendingMcpToolCall;
      pauseState: RunAgentPauseState;
      output: string;
      toolCalls: ChatToolCall[];
      usage: Omit<RunAgentUsage, "costMicroUsd">;
      stopReason: "tool_use";
    };

/** The loop's internal working state (also what a pause snapshots). */
type LoopWorkingState = {
  loopMessages: AnthropicChatMessage[];
  output: string;
  toolCalls: ChatToolCall[];
  usage: Omit<RunAgentUsage, "costMicroUsd">;
  round: number;
};

/**
 * Finalize a held/refused tool call into an is_error tool_result the model can
 * recover from (unknown tool, or a refused headless write). Mutates the trace.
 */
function holdToolCall(
  toolCall: ChatToolCall,
  errorCode: string,
  message: string,
): AnthropicToolResultBlock {
  toolCall.status = "error";
  toolCall.finished_at = new Date().toISOString();
  toolCall.error = errorCode;
  toolCall.error_message = message;
  return {
    type: "tool_result",
    tool_use_id: toolCall.id,
    content: message,
    is_error: true,
  };
}

/** Snapshot a paused loop into the persisted/returned outcome. */
function pausedOutcome(
  state: LoopWorkingState,
  pendingWrite: PendingMcpToolCall,
  partialToolResults: AnthropicToolResultBlock[],
): RunAgentLoopOutcome {
  const pauseState: RunAgentPauseState = {
    loopMessages: state.loopMessages,
    partialToolResults,
    pendingToolUseId: pendingWrite.toolUseId,
    output: state.output,
    toolCalls: state.toolCalls,
    round: state.round,
    usage: state.usage,
  };
  return {
    status: "paused",
    pendingWrite,
    pauseState,
    output: state.output,
    toolCalls: state.toolCalls,
    usage: state.usage,
    stopReason: "tool_use",
  };
}

/**
 * Process one assistant turn's tool_use blocks: already-resolved ids (a resume's
 * pre-pause reads and the decided write) are answered from `resolved` without
 * re-executing or re-counting; reads execute via the injected executor; a write
 * refuses (default) or pauses ("pause" policy); unknown tools hold as errors.
 * Mirrors the chat loop's resolved-map resume design.
 */
async function processTurnBlocks(
  deps: RunAgentLoopDeps,
  state: LoopWorkingState,
  blocks: ToolUseBlock[],
  resolved: Map<string, AnthropicToolResultBlock>,
): Promise<
  | { kind: "results"; toolResults: AnthropicToolResultBlock[] }
  | {
      kind: "pause";
      pendingWrite: PendingMcpToolCall;
      partialToolResults: AnthropicToolResultBlock[];
    }
> {
  const toolResults: AnthropicToolResultBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;

    // A resume answers already-settled calls from the resolved map — they were
    // counted and traced when they first ran (or paused), so nothing repeats.
    const already = resolved.get(block.id);
    if (already) {
      toolResults.push(already);
      continue;
    }

    state.usage.mcpToolCallCount += 1;
    const startedAt = new Date().toISOString();
    const summary = mcpArgsSummary(block.input);
    const route = deps.routingMap[block.name];
    const access = deps.accessByName.get(block.name) ?? "write";

    const toolCall: ChatToolCall = {
      id: block.id,
      name: block.name,
      input: summary,
      output: null,
      status: "running",
      started_at: startedAt,
      position: state.output.length,
      access,
      server: route?.serverId,
    };
    state.toolCalls.push(toolCall);

    // Unknown tool (the model can only call offered tools — guard anyway).
    if (!route) {
      toolResults.push(
        holdToolCall(
          toolCall,
          "unknown_tool",
          "The tool call failed: the requested tool is not available.",
        ),
      );
      continue;
    }

    if (access === "write") {
      if ((deps.writes ?? "refuse") === "pause") {
        // PAUSE for a human decision. The write does NOT execute here — only
        // resumeAgentLoop's approve path runs it, via the injected executor.
        // The pending call keeps the agent's ACTUAL chosen input at full
        // fidelity (Fork 2) alongside the PII-safe argKeys, in the same shape
        // the chat pause persists.
        toolCall.status = "awaiting_confirmation";
        return {
          kind: "pause",
          pendingWrite: {
            toolUseId: block.id,
            name: block.name,
            route,
            input: block.input,
            argKeys: summary.argKeys,
          },
          partialToolResults: toolResults,
        };
      }
      // Default refuse policy: never execute a write unattended. Writes aren't
      // offered to the model here; this refusal is the second guard.
      toolResults.push(
        holdToolCall(toolCall, "write_not_executed", HEADLESS_WRITE_MESSAGE),
      );
      continue;
    }

    // READ: execute (never throws; returns a tool_result + token/PII-safe trace).
    const exec = await deps.toolExec({
      route,
      toolInput: block.input,
      toolUseId: block.id,
    });
    const ok = exec.trace.status === "ok";
    toolCall.status = ok ? "done" : "error";
    toolCall.finished_at = exec.trace.finishedAt;
    toolCall.output = { source_ids: [] };
    if (!ok) {
      toolCall.error = exec.trace.errorCode;
      if (exec.trace.errorMessage) {
        toolCall.error_message = exec.trace.errorMessage;
      }
    }
    toolResults.push(exec.toolResult);
  }
  return { kind: "results", toolResults };
}

/**
 * Drive the model⇄tool loop from the given state until the run completes, the
 * budget is spent, or a write pauses it. Shared by a fresh run (round 0) and a
 * resume continuation (the paused round onward).
 */
async function driveLoop(
  deps: RunAgentLoopDeps,
  state: LoopWorkingState,
): Promise<RunAgentLoopOutcome> {
  const deadline = deps.now() + deps.wallClockMs;

  for (;;) {
    state.round += 1;
    const budgetExhausted =
      state.round >= deps.maxRounds || deps.now() >= deadline;
    // Once the budget is spent, or there are no tools to offer, take a final
    // no-tools turn so the model produces a closing answer instead of looping.
    const turnTools =
      budgetExhausted || deps.offeredTools.length === 0
        ? undefined
        : deps.offeredTools;

    const turn = await deps.modelTurn(state.loopMessages, turnTools);
    state.usage.tokensIn += turn.usage.input_tokens;
    state.usage.tokensOut += turn.usage.output_tokens;
    state.usage.cacheCreation += turn.usage.cache_creation_input_tokens;
    state.usage.cacheRead += turn.usage.cache_read_input_tokens;
    state.usage.webSearch += turn.usage.web_search_requests;

    // Accumulate text across all rounds, exactly as the chat path persists it.
    for (const block of turn.content) {
      if ((block as { type?: string }).type === "text") {
        state.output += (block as { text?: string }).text ?? "";
      }
    }

    if (budgetExhausted || turn.stopReason !== "tool_use") {
      return {
        status: "completed",
        output: state.output,
        toolCalls: state.toolCalls,
        usage: state.usage,
        stopReason: turn.stopReason,
      };
    }

    // Re-send the assistant turn (text + tool_use), then answer each tool_use.
    state.loopMessages.push({ role: "assistant", content: turn.content });
    const outcome = await processTurnBlocks(
      deps,
      state,
      turn.content as unknown as ToolUseBlock[],
      new Map(),
    );
    if (outcome.kind === "pause") {
      return pausedOutcome(state, outcome.pendingWrite, outcome.partialToolResults);
    }
    state.loopMessages.push({
      role: "user",
      content: outcome.toolResults as AnthropicChatMessage["content"],
    });
  }
}

/**
 * The pure, dependency-injected agentic loop. Mirrors the chat loop's fresh path
 * (model → if tool_use, run reads, feed results back, repeat) under the same
 * round/wall-clock guards, MINUS the SSE/persistence machinery — refusing writes
 * by default, or pausing on them under the explicit "pause" policy. No network
 * or DB of its own: modelTurn and toolExec are injected, so this is
 * unit-testable with fakes.
 */
export async function runAgentLoop(
  deps: RunAgentLoopDeps,
): Promise<RunAgentLoopOutcome> {
  const state: LoopWorkingState = {
    loopMessages: [...deps.baseMessages],
    output: "",
    toolCalls: [],
    usage: {
      tokensIn: 0,
      tokensOut: 0,
      cacheCreation: 0,
      cacheRead: 0,
      webSearch: 0,
      mcpToolCallCount: 0,
    },
    round: 0,
  };
  return driveLoop(deps, state);
}

/**
 * Resume a paused loop on a human decision (delight pass D1) — the headless
 * sibling of the chat confirm path's continuation:
 *
 *   - APPROVE: the pending write executes ONCE via the injected executor (real
 *     wiring: executeMcpTool, which re-resolves a live token from the route's
 *     token_ref), its REAL result is fed back for the pending tool_use, and the
 *     loop continues — possibly pausing again on a further write (multi-pause,
 *     mirroring chat's repeated-pause handling). An approved write that FAILS
 *     does not fail the run: the agent sees the error result and narrates it.
 *   - DENY (Fork 1): the shared graceful "declined, do not retry" result is fed
 *     back and the loop CONTINUES, so the agent acknowledges the decline and
 *     finishes normally — the outcome is a completed run, not a failure.
 *
 * The at-most-once guarantee lives in the HOST's atomic claim (chat:
 * mcp_paused_runs pending→resuming; workflows D2: workflow_pending_approvals
 * pending→resolving) — a second decision never reaches this function.
 *
 * Pure and injected like runAgentLoop; the caller passes the SAME deps shape
 * (including writes: "pause" so later writes pause too).
 */
export async function resumeAgentLoop(params: {
  deps: RunAgentLoopDeps;
  pauseState: RunAgentPauseState;
  pendingWrite: PendingMcpToolCall;
  decision: ConfirmationDecision;
}): Promise<RunAgentLoopOutcome> {
  const { deps, pauseState, pendingWrite, decision } = params;

  const state: LoopWorkingState = {
    loopMessages: [...pauseState.loopMessages],
    output: pauseState.output,
    // Per-entry clones so settling the decided write never mutates the caller's
    // persisted pause state.
    toolCalls: pauseState.toolCalls.map((c) => ({ ...c })),
    usage: { ...pauseState.usage },
    round: pauseState.round,
  };

  // Results already known for the paused turn: the reads that ran before the
  // write, plus (below) the now-decided write itself.
  const resolved = new Map<string, AnthropicToolResultBlock>();
  for (const r of pauseState.partialToolResults) {
    resolved.set(r.tool_use_id, r);
  }
  const entry = state.toolCalls.find(
    (c) => c.id === pauseState.pendingToolUseId,
  );

  if (decision === "deny") {
    // Fork 1: graceful decline — the agent continues and acknowledges; the run
    // completes. (The workflow run-cancel distinction for explicit tool_action
    // steps is the engine's concern, not the loop's.)
    resolved.set(
      pauseState.pendingToolUseId,
      assembleDecisionToolResult("deny", pauseState.pendingToolUseId),
    );
    if (entry) {
      entry.status = "denied";
      entry.finished_at = new Date().toISOString();
    }
  } else {
    // APPROVE: the ONLY place a write ever executes — through the injected
    // executor (executeMcpTool in real wiring: live token re-resolved from the
    // route's token_ref; never throws; returns a real or is_error tool_result).
    const exec = await deps.toolExec({
      route: pendingWrite.route,
      toolInput: pendingWrite.input,
      toolUseId: pendingWrite.toolUseId,
    });
    resolved.set(pendingWrite.toolUseId, exec.toolResult);
    // Settle the trace to the real executed outcome (done | error), the same
    // mapping the chat path uses.
    if (entry) Object.assign(entry, executedWriteTraceFields(exec.trace));
  }

  // Finish the paused turn's remaining blocks (they may include ANOTHER write,
  // which pauses again), then continue the main loop.
  const pausedTurn = state.loopMessages[state.loopMessages.length - 1];
  const pausedBlocks = (pausedTurn?.content ?? []) as ToolUseBlock[];
  const outcome = await processTurnBlocks(deps, state, pausedBlocks, resolved);
  if (outcome.kind === "pause") {
    return pausedOutcome(state, outcome.pendingWrite, outcome.partialToolResults);
  }
  state.loopMessages.push({
    role: "user",
    content: outcome.toolResults as AnthropicChatMessage["content"],
  });

  return driveLoop(deps, state);
}

const ZERO_USAGE: RunAgentUsage = {
  tokensIn: 0,
  tokensOut: 0,
  cacheCreation: 0,
  cacheRead: 0,
  webSearch: 0,
  mcpToolCallCount: 0,
  costMicroUsd: 0,
};

/**
 * Run an agent headlessly on a task input and return its output, tool trace, and
 * usage — or, under the explicit writes "pause" policy, a paused result carrying
 * the proposed write + resumable state. Never throws — any failure resolves to
 * { ok: false, error }.
 */
export async function runAgent(
  params: RunAgentParams,
): Promise<RunAgentResult> {
  const { agent, organizationId, userId, input, options } = params;

  const fail = (error: string): RunAgentResult => ({
    ok: false,
    error,
    output: "",
    toolCalls: [],
    usage: ZERO_USAGE,
    stopReason: null,
  });

  try {
    const modelId = options?.model ?? agent.model;
    const { vendor, model: vendorModelName } = parseModelId(modelId);
    if (vendor !== "anthropic") {
      // Match the chat route: only the Anthropic vendor is wired today. An
      // unknown vendor fails cleanly rather than resolving the wrong credential.
      return fail(`Unsupported model vendor: ${vendor}`);
    }

    // Resolved through the SAME seam as chat (the unsupported-vendor and malformed-
    // model-id failures above return before this, so they never touch credentials).
    const credential = await resolveModelCredential({
      organizationId,
      userId,
      vendor,
    });

    // System prompt: the same defense-wrapped agent prompt the chat path builds,
    // cached as a stable prefix. (Agent-attached reference grounding, which the
    // chat path also layers in, can be added later without a signature change.)
    const systemBlocks: AnthropicSystemBlock[] = [
      {
        type: "text",
        text: buildSystemPrompt(agent.system_prompt),
        cache_control: { type: "ephemeral" },
      },
    ];

    const writes: AgentWritePolicy = options?.writes ?? "refuse";

    // Tools OFFERED to the model: web_search (if enabled) + governed MCP tools.
    // Default refuse policy offers READ tools only (writes deliberately never
    // offered); the explicit "pause" policy offers write tools too — the loop
    // pauses before any write executes.
    const enabledTools = Array.isArray(agent.tools_enabled)
      ? agent.tools_enabled
      : [];
    const offeredTools: AnthropicTool[] = [];
    if (enabledTools.includes("web_search")) {
      offeredTools.push({
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      });
    }

    let gated: GatedOrgMcpTools = {
      toolDefs: [],
      routingMap: {},
      accessByName: new Map(),
      loopEngaged: false,
    };
    if (options?.mcpToolsEnabled !== false) {
      gated = await resolveGatedOrgMcpTools();
      for (const def of gated.toolDefs) {
        if (writes === "pause" || gated.accessByName.get(def.name) === "read") {
          offeredTools.push(def);
        }
      }
    }

    const outcome = await runAgentLoop({
      baseMessages: [{ role: "user", content: wrapUserMessage(input) }],
      offeredTools,
      routingMap: gated.routingMap,
      accessByName: gated.accessByName,
      maxRounds: options?.maxRounds ?? MCP_MAX_TOOL_ROUNDS,
      wallClockMs: MCP_LOOP_WALL_CLOCK_MS,
      now: () => Date.now(),
      writes,
      modelTurn: async (messages, tools) => {
        // Headless: drive the SDK stream to completion via finalMessage()/
        // finalUsage() WITHOUT consuming the SSE events generator (both await the
        // underlying SDK stream directly — see lib/llm/anthropic/chat.ts).
        const r = streamAnthropicChat({
          model: vendorModelName,
          credential,
          systemBlocks,
          messages,
          maxTokens: 4096,
          tools,
        });
        const final = await r.finalMessage();
        const usage = await r.finalUsage();
        return {
          stopReason: final.stop_reason,
          content: final.content as Anthropic.Messages.ContentBlockParam[],
          usage,
        };
      },
      toolExec: executeMcpTool,
    });

    // Tokens spent so far are recorded at pause too: usage_events is an additive
    // ledger, so the resume host (D2) records the continuation's increment as
    // its own row and the totals stay honest.
    const costMicroUsd = await recordRunUsage({
      organizationId,
      userId,
      agentId: agent.id,
      model: modelId,
      usage: outcome.usage,
      workflowRunId: options?.workflowRunId,
    });

    if (outcome.status === "paused") {
      return {
        ok: false,
        paused: {
          pendingWrite: outcome.pendingWrite,
          pauseState: outcome.pauseState,
        },
        error: AGENT_RUN_PAUSED_ERROR,
        output: outcome.output,
        toolCalls: outcome.toolCalls,
        usage: { ...outcome.usage, costMicroUsd },
        stopReason: outcome.stopReason,
      };
    }

    return {
      ok: true,
      output: outcome.output,
      toolCalls: outcome.toolCalls,
      usage: { ...outcome.usage, costMicroUsd },
      stopReason: outcome.stopReason,
    };
  } catch (err) {
    // Never throw across the boundary — log the detail, return a safe message.
    console.error("runAgent failed", err);
    return fail("The agent run could not be completed.");
  }
}

/**
 * Record a usage_events row for a headless run so workflow-run cost tracking is
 * unified with chat from day one. There is no conversation/message for a headless
 * run, so those columns stay null (both are nullable); a workflow run id can be
 * threaded in later (Step 2). Best-effort and never throws: a usage-logging
 * failure must not fail the run. Returns the computed cost (0 on a pricing miss).
 *
 * Uses the service-role client: the run is server-side and may have no request
 * session (a future scheduled trigger), and this is an append-only cost ledger
 * write attributed to org/user/agent — not a user-scoped data read.
 */
async function recordRunUsage(args: {
  organizationId: string;
  userId: string;
  agentId: string;
  model: string;
  usage: Omit<RunAgentUsage, "costMicroUsd">;
  workflowRunId?: string;
}): Promise<number> {
  const { organizationId, userId, agentId, model, usage, workflowRunId } = args;

  let costMicroUsd = 0;
  try {
    costMicroUsd = computeCostMicroUsd(
      usage.tokensIn,
      usage.tokensOut,
      usage.cacheCreation,
      usage.cacheRead,
      usage.webSearch,
      model,
    );
  } catch (err) {
    // Unknown model in the pricing table: record cost 0 so token counts still land.
    console.error("computeCostMicroUsd failed — recording cost 0", err);
  }

  const usageRow = {
    organization_id: organizationId,
    user_id: userId,
    agent_id: agentId,
    model,
    tokens_in: usage.tokensIn,
    tokens_out: usage.tokensOut,
    cache_creation_tokens: usage.cacheCreation,
    cache_read_tokens: usage.cacheRead,
    web_search_count: usage.webSearch,
    cost_micro_usd: costMicroUsd,
    // Only set when a workflow run is the caller — its presence implies migration
    // 0060 is applied (the run row exists), so the column is present. Omitted
    // entirely for chat / standalone runs, keeping that path unchanged.
    ...(workflowRunId ? { workflow_run_id: workflowRunId } : {}),
  };

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("usage_events")
      .insert({ ...usageRow, mcp_tool_call_count: usage.mcpToolCallCount });
    if (error) {
      // 42703 = undefined_column: mcp_tool_call_count not applied yet. Retry
      // without it so the core row still records (matches the chat path).
      if (error.code === "42703") {
        const { error: retryErr } = await admin
          .from("usage_events")
          .insert(usageRow);
        if (retryErr) {
          console.error("usage_events insert failed", { code: retryErr.code });
        }
      } else {
        console.error("usage_events insert failed", { code: error.code });
      }
    }
  } catch (err) {
    console.error("usage_events insert threw", err);
  }

  return costMicroUsd;
}
