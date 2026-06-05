import "server-only";

import { executeMcpTool } from "@/lib/connections/mcp/execute-tool";
import type { McpToolAccess } from "@/lib/connections/mcp/tool-classification";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import {
  streamAnthropicChat,
  type AnthropicChatMessage,
  type AnthropicCustomTool,
  type AnthropicStreamEvent,
  type AnthropicSystemBlock,
  type AnthropicTool,
  type AnthropicToolResultBlock,
} from "@/lib/llm/anthropic/chat";
import {
  encodeSseEvent,
  SSE_RESPONSE_HEADERS,
  type ChatSource,
  type ChatToolCall,
} from "@/lib/llm/anthropic/stream";
import type { MessageRole } from "@/lib/llm/anthropic/types";
import type { ModelCredential } from "@/lib/connections/providers/types";
import { resolveModelCredential } from "@/lib/llm/model-credential";
import { computeCostMicroUsd } from "@/lib/llm/pricing";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assembleDecisionToolResult,
  buildConfirmationPayload,
  executedWriteTraceFields,
  type ConfirmationDecision,
  type PendingMcpToolCall,
} from "@/lib/chat/mcp-confirmation";

/**
 * The streaming heart of the native-agent chat turn (extracted from
 * app/api/chat/route.ts in 2P-7b-i so the FRESH turn and the RESUME of a paused
 * write-confirmation share one machinery — consumeStream, the agentic loop,
 * citation draining, and persistence — rather than duplicating ~600 lines).
 *
 * The fresh path is behavior-preserving: given fresh-mode params equal to the
 * route's prior inline values, it streams byte-identically to before. The new
 * surface is the WRITE pause (persist a resumable run, surface a confirmation
 * event, end cleanly) and the RESUME (seed from that run, inject the decision,
 * continue the loop). See DECISION_LOG (2P-7b-i) and docs/PHASE2_MCP_TOOLUSE.md.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// ---- MCP agentic tool-use loop guards (verbatim from the route, 2P-6b). ----
const MCP_MAX_TOOL_ROUNDS = 8;
const MCP_LOOP_WALL_CLOCK_MS = 240_000;
// The v1 fallback result fed back to the model when a write can't be paused for
// confirmation (e.g. the paused-runs table is unavailable) — nothing is sent.
const MCP_WRITE_BLOCKED_MESSAGE =
  "This action needs confirmation and is not yet enabled, so nothing was sent, created, or deleted. Tell the user what you would do and that it requires confirmation.";

/**
 * Sentence-end / structural-boundary regex driving citation drain timing —
 * citations land AFTER a cited claim, never before. Verbatim from the route.
 */
const CITATION_DRAIN_RE =
  /[.!?](?=\s|$)|(?=\n\n)|(?=\n[*\-+] )|(?=\n#{1,6}\s)|(?=\n>\s)|(?=\n\d+\. )/;

/** A short opaque id (12 hex chars) prefixed with the given tag (citation ids). */
function shortId(prefix: string): string {
  const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${hex}`;
}

/** Clean display domain: hostname stripped of a leading "www.", input on failure. */
function domainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return url;
  }
}

/**
 * A token/PII-free summary of an MCP tool call's arguments for the trace + the
 * confirmation card: the sorted argument KEY NAMES only, never the values.
 */
function mcpArgsSummary(input: unknown): { argKeys: string[] } {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { argKeys: Object.keys(input as Record<string, unknown>).sort() };
  }
  return { argKeys: [] };
}

/** Summed token usage carried across the loop (and across a pause/resume). */
export type ChatTurnUsage = {
  tokensIn: number | null;
  tokensOut: number | null;
  cacheCreation: number;
  cacheRead: number;
  webSearch: number;
  mcpToolCallCount: number;
};

/**
 * Everything needed to resume a paused loop deterministically, persisted into
 * mcp_paused_runs.loop_state. The user's own conversation data (model content +
 * the write's input) lives here, NOT in the message history, so persisted
 * history stays string text + tool_calls JSONB. No tokens — see the migration.
 */
export type LoopState = {
  systemBlocks: AnthropicSystemBlock[];
  tools: AnthropicTool[];
  agentId: string;
  modelSnapshot: string;
  vendor: string;
  vendorModelName: string;
  /** Content-block messages so far, INCLUDING the paused assistant turn (last). */
  loopMessages: AnthropicChatMessage[];
  /** Tool results already produced this turn (reads before the paused write). */
  partialToolResults: AnthropicToolResultBlock[];
  /** The tool_use id of the write awaiting a decision. */
  pendingToolUseId: string;
  assistantText: string;
  sources: ChatSource[];
  toolCalls: ChatToolCall[];
  round: number;
  usage: ChatTurnUsage;
};

/** The two ways a turn streams: a fresh user message, or resuming a decision. */
export type ChatTurnMode =
  | { kind: "fresh"; userMessageId: string; baseMessages: AnthropicChatMessage[] }
  | {
      kind: "resume";
      assistantMessageId: string;
      pausedRunId: string;
      decision: ConfirmationDecision;
      seed: LoopState;
      /**
       * The write the model requested, with the route + input to execute it on
       * approve (2P-7b-ii). Read from the paused run's pending_tool_call column.
       * The token is NEVER stored — only route.tokenRef, re-resolved live by
       * executeMcpTool.
       */
      pending: PendingMcpToolCall;
    };

/** All inputs the streaming machinery needs, gathered by each caller. */
export type ChatTurnContext = {
  supabase: SupabaseServerClient;
  conversationId: string;
  organizationId: string;
  agentId: string;
  userId: string;
  modelSnapshot: string;
  vendor: string;
  vendorModelName: string;
  systemBlocks: AnthropicSystemBlock[];
  tools: AnthropicTool[];
  mcpToolDefs: AnthropicCustomTool[];
  mcpRoutingMap: Record<string, McpToolRoute>;
  mcpAccessByName: Map<string, McpToolAccess>;
  mcpLoopEngaged: boolean;
  mode: ChatTurnMode;
};

/**
 * A minimal view of a model content block as iterated from an assistant turn.
 * Non-tool_use blocks (e.g. text) are skipped by the `type` guard before id /
 * name / input are read, so asserting them present is safe.
 */
type ToolUseBlock = { type: string; id: string; name: string; input: unknown };

/** The result of attempting one MCP tool call inside a turn. */
type ToolOutcome =
  | { kind: "result"; toolResult: AnthropicToolResultBlock }
  | { kind: "pause"; toolCall: ChatToolCall; pending: PendingMcpToolCall };

/**
 * Stream one native-agent chat turn (fresh or resume) as Server-Sent Events.
 * Returns the SSE Response; all work happens inside the ReadableStream so the
 * caller just returns this.
 */
export function streamChatTurn(ctx: ChatTurnContext): Response {
  const {
    supabase,
    conversationId,
    organizationId,
    agentId,
    userId,
    modelSnapshot,
    vendor,
    vendorModelName,
    systemBlocks,
    tools,
    mcpToolDefs,
    mcpRoutingMap,
    mcpAccessByName,
    mcpLoopEngaged,
    mode,
  } = ctx;

  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const resumeSeed = mode.kind === "resume" ? mode.seed : null;

      // Fresh turns announce the conversation + user message ids up front. A
      // resume continues an existing assistant message, so it emits no meta.
      if (mode.kind === "fresh") {
        controller.enqueue(
          encodeSseEvent({
            type: "meta",
            conversation_id: conversationId,
            user_message_id: mode.userMessageId,
          }),
        );
      }

      // ---- Stream-local accumulators (seeded from the paused run on resume).
      let assistantText = resumeSeed?.assistantText ?? "";
      const sources: ChatSource[] = resumeSeed ? [...resumeSeed.sources] : [];
      const sourceByUrl = new Map<string, string>();
      if (resumeSeed) {
        for (const s of resumeSeed.sources) sourceByUrl.set(s.url, s.id);
      }
      const toolCalls: ChatToolCall[] = resumeSeed ? [...resumeSeed.toolCalls] : [];
      let pendingSourceAttributions: string[] = [];
      let lastDoneToolCallIndex: number | null = null;
      let pendingCitations: string[] = [];

      // The assistant message this turn persists into. Null on a fresh turn
      // until the first persist inserts it; preset on resume (we UPDATE it, so
      // one user turn stays one assistant message even across the pause).
      let assistantMessageId: string | null =
        mode.kind === "resume" ? mode.assistantMessageId : null;

      function drainCitations() {
        if (pendingCitations.length === 0) return;
        const seen = new Set<string>();
        let markers = "";
        for (const sid of pendingCitations) {
          if (seen.has(sid)) continue;
          seen.add(sid);
          markers += `<sup data-source-id="${sid}"></sup>`;
        }
        pendingCitations = [];
        if (markers.length > 0) {
          assistantText += markers;
          controller.enqueue(encodeSseEvent({ type: "token", text: markers }));
        }
      }

      let tokensIn: number | null = resumeSeed?.usage.tokensIn ?? null;
      let tokensOut: number | null = resumeSeed?.usage.tokensOut ?? null;
      let cacheCreationTokens = resumeSeed?.usage.cacheCreation ?? 0;
      let cacheReadTokens = resumeSeed?.usage.cacheRead ?? 0;
      let webSearchCount = resumeSeed?.usage.webSearch ?? 0;
      let mcpToolCallCount = resumeSeed?.usage.mcpToolCallCount ?? 0;
      let streamError: Error | null = null;
      // Set when the loop pauses on a write: the request is over (the
      // confirmation event was emitted and the controller closed in
      // pauseOnWrite), so the end-of-stream persistence must be skipped.
      let paused = false;

      // Consume ONE model stream into the shared accumulators + SSE. The event
      // handling is verbatim from the pre-2P-7b single-pass consumption.
      async function consumeStream(
        events: AsyncIterable<AnthropicStreamEvent>,
      ): Promise<void> {
        for await (const event of events) {
          switch (event.type) {
            case "text": {
              if (pendingCitations.length === 0) {
                assistantText += event.text;
                controller.enqueue(
                  encodeSseEvent({ type: "token", text: event.text }),
                );
                break;
              }
              const m = event.text.match(CITATION_DRAIN_RE);
              if (!m || m.index === undefined) {
                assistantText += event.text;
                controller.enqueue(
                  encodeSseEvent({ type: "token", text: event.text }),
                );
                break;
              }
              const splitEnd = m.index + m[0].length;
              const head = event.text.slice(0, splitEnd);
              const tail = event.text.slice(splitEnd);
              if (head.length > 0) {
                assistantText += head;
                controller.enqueue(
                  encodeSseEvent({ type: "token", text: head }),
                );
              }
              drainCitations();
              if (tail.length > 0) {
                assistantText += tail;
                controller.enqueue(
                  encodeSseEvent({ type: "token", text: tail }),
                );
              }
              break;
            }
            case "tool_trace_start": {
              drainCitations();
              const position = assistantText.length;
              const toolCall: ChatToolCall = {
                id: event.id,
                name: event.toolName,
                input: event.input,
                output: null,
                status: "running",
                started_at: event.startedAt,
                position,
              };
              toolCalls.push(toolCall);
              controller.enqueue(
                encodeSseEvent({
                  type: "tool_trace_start",
                  id: event.id,
                  name: event.toolName,
                  input: event.input,
                  started_at: event.startedAt,
                  position,
                }),
              );
              break;
            }
            case "tool_trace_done": {
              drainCitations();
              const idx = toolCalls.findIndex((t) => t.id === event.id);
              if (idx >= 0) {
                if (
                  lastDoneToolCallIndex !== null &&
                  pendingSourceAttributions.length > 0
                ) {
                  const prev = toolCalls[lastDoneToolCallIndex];
                  prev.output = {
                    source_ids: [
                      ...(prev.output?.source_ids ?? []),
                      ...pendingSourceAttributions,
                    ],
                  };
                }
                pendingSourceAttributions = [];
                toolCalls[idx].status = "done";
                toolCalls[idx].finished_at = event.finishedAt;
                toolCalls[idx].output = { source_ids: [] };
                lastDoneToolCallIndex = idx;
              }
              controller.enqueue(
                encodeSseEvent({
                  type: "tool_trace_done",
                  id: event.id,
                  output: { source_ids: [] },
                  finished_at: event.finishedAt,
                }),
              );
              break;
            }
            case "tool_trace_error": {
              drainCitations();
              const idx = toolCalls.findIndex((t) => t.id === event.id);
              if (idx >= 0) {
                toolCalls[idx].status = "error";
                toolCalls[idx].finished_at = event.finishedAt;
                toolCalls[idx].error = event.error;
              }
              controller.enqueue(
                encodeSseEvent({
                  type: "tool_trace_error",
                  id: event.id,
                  error: event.error,
                  finished_at: event.finishedAt,
                }),
              );
              break;
            }
            case "citation": {
              let sourceId = sourceByUrl.get(event.url);
              if (!sourceId) {
                sourceId = shortId("src");
                sourceByUrl.set(event.url, sourceId);
                const source: ChatSource = {
                  id: sourceId,
                  title: event.title,
                  url: event.url,
                  domain: domainFromUrl(event.url),
                };
                sources.push(source);
                controller.enqueue(
                  encodeSseEvent({
                    type: "source_added",
                    id: source.id,
                    title: source.title,
                    url: source.url,
                    domain: source.domain,
                  }),
                );
                pendingSourceAttributions.push(sourceId);
              }
              pendingCitations.push(sourceId);
              break;
            }
          }
        }
      }

      function addUsage(usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens: number;
        cache_read_input_tokens: number;
        web_search_requests: number;
      }): void {
        tokensIn = (tokensIn ?? 0) + usage.input_tokens;
        tokensOut = (tokensOut ?? 0) + usage.output_tokens;
        cacheCreationTokens += usage.cache_creation_input_tokens;
        cacheReadTokens += usage.cache_read_input_tokens;
        webSearchCount += usage.web_search_requests;
      }

      // Insert (fresh) or update (resume / after a prior persist) the assistant
      // message with the current body + sources + tool_calls trace. Returns the
      // message id, or null on a hard failure.
      async function persistAssistant(): Promise<string | null> {
        const row = {
          conversation_id: conversationId,
          role: "assistant" satisfies MessageRole,
          content: assistantText,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          sources,
          tool_calls: toolCalls,
        };
        if (assistantMessageId === null) {
          const { data, error } = await supabase
            .from("messages")
            .insert(row)
            .select("id")
            .single();
          if (error || !data) {
            console.error("assistant message insert failed", {
              code: error?.code,
            });
            return null;
          }
          assistantMessageId = data.id;
          return assistantMessageId;
        }
        const { error } = await supabase
          .from("messages")
          .update(row)
          .eq("id", assistantMessageId);
        if (error) {
          console.error("assistant message update failed", { code: error.code });
          return null;
        }
        return assistantMessageId;
      }

      /** Finalize a held/failed MCP tool call into an is_error tool_result. */
      function holdMcpToolCall(
        toolCall: ChatToolCall,
        errorCode: string,
        message: string,
      ): AnthropicToolResultBlock {
        const finishedAt = new Date().toISOString();
        toolCall.status = "error";
        toolCall.finished_at = finishedAt;
        toolCall.error = errorCode;
        toolCall.error_message = message;
        controller.enqueue(
          encodeSseEvent({
            type: "tool_trace_error",
            id: toolCall.id,
            error: errorCode,
            finished_at: finishedAt,
          }),
        );
        return {
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: message,
          is_error: true,
        };
      }

      // Persist the resumable run + surface the Approve/Deny card, then end the
      // request. Returns "paused" on success. If the paused-run record can't be
      // written (e.g. the table isn't applied yet), degrades gracefully to the
      // legacy "blocked, nothing sent" hold and returns the hold result so the
      // loop continues — preserving the v1 no-write guarantee either way.
      async function pauseOnWrite(
        toolCall: ChatToolCall,
        pending: PendingMcpToolCall,
        loopMessages: AnthropicChatMessage[],
        partialToolResults: AnthropicToolResultBlock[],
        round: number,
      ): Promise<"paused" | { kind: "fallback"; holdResult: AnthropicToolResultBlock }> {
        const runId = crypto.randomUUID();
        toolCall.status = "awaiting_confirmation";
        toolCall.confirmation = { paused_run_id: runId };

        const persistedId = await persistAssistant();
        if (!persistedId) {
          // Couldn't even persist the message; fall back to the legacy hold so
          // the turn still completes and nothing is written.
          const fallback = holdMcpToolCall(
            toolCall,
            "write_blocked",
            MCP_WRITE_BLOCKED_MESSAGE,
          );
          toolCall.confirmation = undefined;
          return { kind: "fallback", holdResult: fallback };
        }

        const loopState: LoopState = {
          systemBlocks,
          tools,
          agentId,
          modelSnapshot,
          vendor,
          vendorModelName,
          loopMessages,
          partialToolResults,
          pendingToolUseId: pending.toolUseId,
          assistantText,
          sources,
          toolCalls,
          round,
          usage: {
            tokensIn,
            tokensOut,
            cacheCreation: cacheCreationTokens,
            cacheRead: cacheReadTokens,
            webSearch: webSearchCount,
            mcpToolCallCount,
          },
        };

        const { error: runErr } = await supabase.from("mcp_paused_runs").insert({
          id: runId,
          conversation_id: conversationId,
          message_id: persistedId,
          user_id: userId,
          organization_id: organizationId,
          status: "pending",
          pending_tool_call: pending,
          loop_state: loopState,
        });
        if (runErr) {
          console.error("mcp_paused_runs insert failed — falling back to hold", {
            code: runErr.code,
          });
          // Revert the trace entry to a legacy hold and surface it so the user
          // still sees the (blocked) action. The message is re-persisted with
          // the corrected trace at end-of-stream.
          toolCall.confirmation = undefined;
          toolCall.status = "running";
          const fallback = holdMcpToolCall(
            toolCall,
            "write_blocked",
            MCP_WRITE_BLOCKED_MESSAGE,
          );
          return { kind: "fallback", holdResult: fallback };
        }

        // Resuming a prior run that led to ANOTHER write closes out the prior
        // run; the new pending run carries the new decision.
        if (mode.kind === "resume") {
          await supabase
            .from("mcp_paused_runs")
            .update({ status: "resumed" })
            .eq("id", mode.pausedRunId);
        }

        const payload = buildConfirmationPayload(pending);
        controller.enqueue(
          encodeSseEvent({
            type: "tool_confirmation_required",
            paused_run_id: runId,
            assistant_message_id: persistedId,
            tool_call_id: pending.toolUseId,
            tool_name: payload.toolName,
            server: payload.server,
            access: "write",
            arg_keys: payload.argKeys,
          }),
        );

        // Reflect genuine last activity so the home ordering is correct.
        const { error: bumpErr } = await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
        if (bumpErr) {
          console.error("conversation updated_at bump failed", {
            code: bumpErr.code,
          });
        }

        paused = true;
        controller.close();
        return "paused";
      }

      // Run one MCP tool_use block. Reads execute inline (emitting trace
      // events); the FIRST write does not execute — it returns a pause signal so
      // the caller can persist + surface the confirmation. Unknown tools hold as
      // errors (never pause). mcpToolCallCount counts every requested call.
      async function runOneMcpToolCall(block: ToolUseBlock): Promise<ToolOutcome> {
        mcpToolCallCount += 1;
        drainCitations();
        const startedAt = new Date().toISOString();
        const position = assistantText.length;
        const summary = mcpArgsSummary(block.input);
        const route = mcpRoutingMap[block.name];
        const access = mcpAccessByName.get(block.name) ?? "write";

        const toolCall: ChatToolCall = {
          id: block.id,
          name: block.name,
          input: summary,
          output: null,
          status: "running",
          started_at: startedAt,
          position,
          access,
          server: route?.serverId,
        };
        toolCalls.push(toolCall);

        // Unknown tool (the model can only call offered tools — guard anyway).
        if (!route) {
          controller.enqueue(
            encodeSseEvent({
              type: "tool_trace_start",
              id: block.id,
              name: block.name,
              input: summary,
              started_at: startedAt,
              position,
            }),
          );
          return {
            kind: "result",
            toolResult: holdMcpToolCall(
              toolCall,
              "unknown_tool",
              "The tool call failed: the requested tool is not available.",
            ),
          };
        }

        // WRITE: pause for human confirmation (no tool_trace_start — the
        // confirmation event carries everything the client needs).
        if (access === "write") {
          return {
            kind: "pause",
            toolCall,
            pending: {
              toolUseId: block.id,
              name: block.name,
              route,
              input: block.input,
              argKeys: summary.argKeys,
            },
          };
        }

        // READ: execute (never throws; returns a tool_result + safe trace).
        controller.enqueue(
          encodeSseEvent({
            type: "tool_trace_start",
            id: block.id,
            name: block.name,
            input: summary,
            started_at: startedAt,
            position,
          }),
        );
        const exec = await executeMcpTool({
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
        controller.enqueue(
          encodeSseEvent(
            ok
              ? {
                  type: "tool_trace_done",
                  id: block.id,
                  output: { source_ids: [] },
                  finished_at: exec.trace.finishedAt,
                }
              : {
                  type: "tool_trace_error",
                  id: block.id,
                  error: exec.trace.errorCode ?? "error",
                  finished_at: exec.trace.finishedAt,
                },
          ),
        );
        return { kind: "result", toolResult: exec.toolResult };
      }

      // Process one assistant turn's tool_use blocks IN ORDER. Reads before the
      // first write execute; the first write pauses (and we stop). Blocks whose
      // result is already known (resume's executed reads + the decided write)
      // are reused via `resolved`. Pushes the user tool_results turn and returns
      // "complete", or returns "paused" without pushing.
      async function processTurnBlocks(
        content: ToolUseBlock[],
        loopMessages: AnthropicChatMessage[],
        resolved: Map<string, AnthropicToolResultBlock>,
        round: number,
      ): Promise<"complete" | "paused"> {
        const toolResults: AnthropicToolResultBlock[] = [];
        for (const block of content) {
          if (block.type !== "tool_use") continue;
          const known = resolved.get(block.id);
          if (known) {
            toolResults.push(known);
            continue;
          }
          const outcome = await runOneMcpToolCall(block);
          if (outcome.kind === "pause") {
            const res = await pauseOnWrite(
              outcome.toolCall,
              outcome.pending,
              loopMessages,
              toolResults,
              round,
            );
            if (res === "paused") return "paused";
            toolResults.push(res.holdResult);
            continue;
          }
          toolResults.push(outcome.toolResult);
        }
        loopMessages.push({
          role: "user",
          content: toolResults as AnthropicChatMessage["content"],
        });
        return "complete";
      }

      // The gated agentic loop. On resume, first inject the decision for the
      // paused write + finish that turn's remaining blocks, then continue.
      async function runMcpLoop(credential: ModelCredential): Promise<void> {
        const allTools: AnthropicTool[] = [...tools, ...mcpToolDefs];
        let loopMessages: AnthropicChatMessage[];
        let round: number;

        if (mode.kind === "resume") {
          loopMessages = [...mode.seed.loopMessages];
          round = mode.seed.round;
          // Reconstruct the results known for the paused turn: the reads already
          // executed before the write, plus the now-decided write.
          const resolved = new Map<string, AnthropicToolResultBlock>();
          for (const r of mode.seed.partialToolResults) {
            resolved.set(r.tool_use_id, r);
          }
          const pendingId = mode.seed.pendingToolUseId;
          const entry = toolCalls.find((c) => c.id === pendingId);

          if (mode.decision === "deny") {
            // Decline: feed a declined result; nothing executes.
            resolved.set(pendingId, assembleDecisionToolResult("deny", pendingId));
            if (entry) {
              entry.status = "denied";
              entry.finished_at = new Date().toISOString();
            }
          } else {
            // Approve: EXECUTE the real write (2P-7b-ii). The same executor reads
            // use — a fresh access token is resolved live from the route's
            // token_ref INSIDE executeMcpTool; no stored token is ever read or
            // logged. It never throws, returning a real or is_error tool_result +
            // a token/PII-safe trace. The atomic pending→resuming claim in
            // /api/chat/confirm guarantees this runs at most once (a second
            // confirm finds the run no longer 'pending'), so a double-click or
            // retry cannot fire the write twice.
            const exec = await executeMcpTool({
              route: mode.pending.route,
              toolInput: mode.pending.input,
              toolUseId: pendingId,
            });
            resolved.set(pendingId, exec.toolResult);
            const fields = executedWriteTraceFields(exec.trace);
            // Settle the trace to the real executed outcome (done | error), so a
            // reload and the friendly UI both show an actually-executed write.
            if (entry) Object.assign(entry, fields);
            // Transition the client's optimistic "running" card to that outcome,
            // e.g. "Google Drive: create file · Done" (or the safe error reason).
            controller.enqueue(
              encodeSseEvent(
                fields.status === "done"
                  ? {
                      type: "tool_trace_done",
                      id: pendingId,
                      output: { source_ids: [] },
                      finished_at: fields.finished_at,
                    }
                  : {
                      type: "tool_trace_error",
                      id: pendingId,
                      error: fields.error ?? "error",
                      finished_at: fields.finished_at,
                    },
              ),
            );
          }
          const pausedTurn = loopMessages[loopMessages.length - 1];
          const pausedContent = (pausedTurn?.content ?? []) as ToolUseBlock[];
          const finished = await processTurnBlocks(
            pausedContent,
            loopMessages,
            resolved,
            round,
          );
          if (finished === "paused") return;
        } else {
          loopMessages = [...mode.baseMessages];
          round = 0;
        }

        const deadline = Date.now() + MCP_LOOP_WALL_CLOCK_MS;
        for (;;) {
          round += 1;
          const budgetExhausted =
            round >= MCP_MAX_TOOL_ROUNDS || Date.now() >= deadline;
          const turnTools = budgetExhausted ? [] : allTools;
          const r = streamAnthropicChat({
            model: vendorModelName,
            credential,
            systemBlocks,
            messages: loopMessages,
            maxTokens: 4096,
            tools: turnTools.length > 0 ? turnTools : undefined,
          });
          await consumeStream(r.events);
          addUsage(await r.finalUsage());

          const finalMessage = await r.finalMessage();
          if (budgetExhausted || finalMessage.stop_reason !== "tool_use") {
            drainCitations();
            break;
          }

          drainCitations();
          loopMessages.push({
            role: "assistant",
            content: finalMessage.content as AnthropicChatMessage["content"],
          });
          const empty = new Map<string, AnthropicToolResultBlock>();
          const finished = await processTurnBlocks(
            finalMessage.content as unknown as ToolUseBlock[],
            loopMessages,
            empty,
            round,
          );
          if (finished === "paused") return;
        }
      }

      try {
        if (vendor !== "anthropic") {
          throw new Error(`Unsupported model vendor: ${vendor}`);
        }
        const credential = await resolveModelCredential({
          organizationId,
          userId,
          vendor,
        });

        if (mcpLoopEngaged || mode.kind === "resume") {
          await runMcpLoop(credential);
        } else {
          // Single-pass — byte-identical to the pre-2P-6b path.
          const base = mode.kind === "fresh" ? mode.baseMessages : [];
          const r = streamAnthropicChat({
            model: vendorModelName,
            credential,
            systemBlocks,
            messages: base,
            maxTokens: 4096,
            tools: tools.length > 0 ? tools : undefined,
          });
          await consumeStream(r.events);
          drainCitations();
          const usage = await r.finalUsage();
          tokensIn = usage.input_tokens;
          tokensOut = usage.output_tokens;
          cacheCreationTokens = usage.cache_creation_input_tokens;
          cacheReadTokens = usage.cache_read_input_tokens;
          webSearchCount = usage.web_search_requests;
        }
      } catch (err) {
        streamError = err instanceof Error ? err : new Error(String(err));
        console.error("model stream failed", err);
        drainCitations();
      }

      // The loop paused for a human decision: the confirmation event was emitted
      // and the stream closed inside pauseOnWrite. Nothing more to persist here.
      if (paused) return;

      // Final source-attribution flush: any sources accumulated after the last
      // tool_trace_done belong to that call.
      if (lastDoneToolCallIndex !== null && pendingSourceAttributions.length > 0) {
        const prev = toolCalls[lastDoneToolCallIndex];
        prev.output = {
          source_ids: [
            ...(prev.output?.source_ids ?? []),
            ...pendingSourceAttributions,
          ],
        };
      }

      // Persist the assistant message (insert fresh, update on resume).
      const persistedId = await persistAssistant();
      if (!persistedId) {
        controller.enqueue(
          encodeSseEvent({ type: "error", error: "internal_error" }),
        );
        controller.close();
        return;
      }

      const { error: bumpErr } = await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (bumpErr) {
        console.error("conversation updated_at bump failed", { code: bumpErr.code });
      }

      // On resume, the paused run is now fully resumed.
      if (mode.kind === "resume") {
        const { error: resolveErr } = await supabase
          .from("mcp_paused_runs")
          .update({ status: "resumed" })
          .eq("id", mode.pausedRunId);
        if (resolveErr) {
          console.error("mcp_paused_runs resolve failed", { code: resolveErr.code });
        }
      }

      if (streamError) {
        controller.enqueue(
          encodeSseEvent({ type: "error", error: "upstream_error" }),
        );
        controller.close();
        return;
      }

      // Persist usage event, summed across all loop rounds (and the pause).
      let costMicroUsd = 0;
      try {
        costMicroUsd = computeCostMicroUsd(
          tokensIn!,
          tokensOut!,
          cacheCreationTokens,
          cacheReadTokens,
          webSearchCount,
          modelSnapshot,
        );
      } catch (err) {
        console.error("computeCostMicroUsd failed — recording cost 0", err);
      }

      const usageRow = {
        organization_id: organizationId,
        user_id: userId,
        agent_id: agentId,
        conversation_id: conversationId,
        message_id: persistedId,
        model: modelSnapshot,
        tokens_in: tokensIn!,
        tokens_out: tokensOut!,
        cache_creation_tokens: cacheCreationTokens,
        cache_read_tokens: cacheReadTokens,
        web_search_count: webSearchCount,
        cost_micro_usd: costMicroUsd,
      };
      const { error: usageErr } = await supabase
        .from("usage_events")
        .insert({ ...usageRow, mcp_tool_call_count: mcpToolCallCount });
      if (usageErr) {
        if (usageErr.code === "42703") {
          const { error: retryErr } = await supabase
            .from("usage_events")
            .insert(usageRow);
          if (retryErr) {
            console.error("usage_events insert failed", { code: retryErr.code });
          }
        } else {
          console.error("usage_events insert failed", { code: usageErr.code });
        }
      }

      controller.enqueue(
        encodeSseEvent({
          type: "done",
          assistant_message_id: persistedId,
          tokens_in: tokensIn!,
          tokens_out: tokensOut!,
        }),
      );
      controller.close();
    },
  });

  return new Response(sseStream, { headers: SSE_RESPONSE_HEADERS });
}
