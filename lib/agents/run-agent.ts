import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

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
 * Headless agent execution (Workflows arc Step 1).
 *
 * runAgent runs an agent's full agentic loop — model turn, governed MCP READ
 * tool calls, feed the results back, repeat — and returns the final result as a
 * value, with NO Server-Sent Events, NO conversation/message persistence, and NO
 * interactive user. It is the building block a workflow agent-step (Step 2) will
 * call, and the first programmatic entry point into agent execution that the
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
 * WRITE SAFETY (v1, unattended-write-free): headless runs OFFER the model only
 * READ-classified MCP tools, and the loop refuses to execute any write tool_use
 * it somehow receives (belt and suspenders) — feeding back a "not performed"
 * result instead. So runAgent introduces NO new write capability and can never
 * perform an unattended write. Human-approved writes in a workflow are the
 * human-checkpoint design (Step 3), not built here.
 */

/** The agent fields a run needs (a resolved row; the caller loads + scopes it). */
export type RunnableAgent = {
  id: string;
  system_prompt: string;
  /** Vendor-prefixed model id, e.g. 'anthropic/claude-opus-4-8'. */
  model: string;
  tools_enabled: string[] | null;
};

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
 * The result of a headless run. A discriminated union on `ok`: a successful run
 * carries the final output; a failed run carries a safe error string. EITHER way
 * the partial output/toolCalls/usage gathered so far are returned, and runAgent
 * NEVER throws (mirroring executeMcpTool's never-throws discipline).
 */
export type RunAgentResult =
  | {
      ok: true;
      output: string;
      toolCalls: ChatToolCall[];
      usage: RunAgentUsage;
      stopReason: string | null;
    }
  | {
      ok: false;
      error: string;
      output: string;
      toolCalls: ChatToolCall[];
      usage: RunAgentUsage;
      stopReason: string | null;
    };

/** The message fed back when the model requests a write in a headless run. */
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
  /** Tools OFFERED to the model: web_search + READ-classified MCP defs only. */
  offeredTools: AnthropicTool[];
  routingMap: Record<string, McpToolRoute>;
  accessByName: Map<string, McpToolAccess>;
  maxRounds: number;
  wallClockMs: number;
  now: () => number;
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

/**
 * The pure, dependency-injected agentic loop. Mirrors the chat loop's fresh path
 * (model → if tool_use, run reads, feed results back, repeat) under the same
 * round/wall-clock guards, MINUS the SSE/persistence/pause machinery — and with
 * the headless write refusal. No network or DB of its own: modelTurn and toolExec
 * are injected, so this is unit-testable with fakes.
 */
export async function runAgentLoop(
  deps: RunAgentLoopDeps,
): Promise<RunAgentLoopResult> {
  const usage = {
    tokensIn: 0,
    tokensOut: 0,
    cacheCreation: 0,
    cacheRead: 0,
    webSearch: 0,
    mcpToolCallCount: 0,
  };
  const toolCalls: ChatToolCall[] = [];
  let output = "";
  let stopReason: string | null = null;

  const loopMessages: AnthropicChatMessage[] = [...deps.baseMessages];
  const deadline = deps.now() + deps.wallClockMs;
  let round = 0;

  for (;;) {
    round += 1;
    const budgetExhausted =
      round >= deps.maxRounds || deps.now() >= deadline;
    // Once the budget is spent, or there are no tools to offer, take a final
    // no-tools turn so the model produces a closing answer instead of looping.
    const turnTools =
      budgetExhausted || deps.offeredTools.length === 0
        ? undefined
        : deps.offeredTools;

    const turn = await deps.modelTurn(loopMessages, turnTools);
    usage.tokensIn += turn.usage.input_tokens;
    usage.tokensOut += turn.usage.output_tokens;
    usage.cacheCreation += turn.usage.cache_creation_input_tokens;
    usage.cacheRead += turn.usage.cache_read_input_tokens;
    usage.webSearch += turn.usage.web_search_requests;
    stopReason = turn.stopReason;

    // Accumulate text across all rounds, exactly as the chat path persists it.
    for (const block of turn.content) {
      if ((block as { type?: string }).type === "text") {
        output += (block as { text?: string }).text ?? "";
      }
    }

    if (budgetExhausted || turn.stopReason !== "tool_use") break;

    // Re-send the assistant turn (text + tool_use), then answer each tool_use.
    loopMessages.push({ role: "assistant", content: turn.content });
    const toolResults: AnthropicToolResultBlock[] = [];
    for (const block of turn.content as unknown as ToolUseBlock[]) {
      if (block.type !== "tool_use") continue;
      usage.mcpToolCallCount += 1;
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
        position: output.length,
        access,
        server: route?.serverId,
      };
      toolCalls.push(toolCall);

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

      // WRITE SAFETY: never execute a write unattended. Writes aren't offered to
      // the model headlessly; this refusal is the second guard if one slips through.
      if (access === "write") {
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
    loopMessages.push({
      role: "user",
      content: toolResults as AnthropicChatMessage["content"],
    });
  }

  return { output, toolCalls, usage, stopReason };
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
 * usage. Never throws — any failure resolves to { ok: false, error }.
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

    // Tools OFFERED to the model: web_search (if enabled) + governed MCP READ
    // tools only. Writes are deliberately never offered in a headless run.
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
        if (gated.accessByName.get(def.name) === "read") {
          offeredTools.push(def);
        }
      }
    }

    const result = await runAgentLoop({
      baseMessages: [{ role: "user", content: wrapUserMessage(input) }],
      offeredTools,
      routingMap: gated.routingMap,
      accessByName: gated.accessByName,
      maxRounds: options?.maxRounds ?? MCP_MAX_TOOL_ROUNDS,
      wallClockMs: MCP_LOOP_WALL_CLOCK_MS,
      now: () => Date.now(),
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

    const costMicroUsd = await recordRunUsage({
      organizationId,
      userId,
      agentId: agent.id,
      model: modelId,
      usage: result.usage,
    });

    return {
      ok: true,
      output: result.output,
      toolCalls: result.toolCalls,
      usage: { ...result.usage, costMicroUsd },
      stopReason: result.stopReason,
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
}): Promise<number> {
  const { organizationId, userId, agentId, model, usage } = args;

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
