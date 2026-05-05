import "server-only";

import { createAnthropicClient } from "./client";

/**
 * Anthropic streaming-chat adapter per docs/AGENT_ARCHITECTURE.md §6.
 *
 * Exposes a uniform { events, finalUsage } shape that the dispatcher in
 * app/api/chat/route.ts consumes. Future vendor adapters (OpenAI, Google
 * — Phase 6 per D-025) implement the same shape so adding a sibling
 * adapter is a new file plus a new case in the dispatcher's switch, with
 * no change to the route handler's stream-consumption code.
 *
 * Session 18b refactored the contract from end-of-stream `tool_use_*` and
 * `citations` events to per-call `tool_trace_*` and per-citation `citation`
 * events, so the route can build first-class trace cards and stream
 * inline source markers as the model produces them. The events contract
 * is vendor-agnostic in shape; per-vendor specifics (which Anthropic
 * content_block types map to which event kind) stay inside this adapter.
 */

/**
 * Discriminated stream event surfaced from the Anthropic SDK loop.
 *
 *   - `text`             — text delta to append to the assistant body
 *   - `tool_trace_start` — server tool invocation started; emitted at
 *                          content_block_stop of the server_tool_use block
 *                          so `input` (the search query) is fully
 *                          accumulated before the trace card lands
 *   - `tool_trace_done`  — matching tool_use_id's tool_result block
 *                          finalized successfully
 *   - `tool_trace_error` — tool_result block surfaced an error code
 *                          (e.g. unavailable, max_uses_exceeded)
 *   - `citation`         — a citations_delta arrived on a text block;
 *                          the route turns these into source records and
 *                          inline <sup> markers
 *
 * `finishedAt` / `startedAt` are ISO timestamps captured at emit time.
 * The route handler treats them as authoritative; persistence stores
 * them on tool_calls.started_at / tool_calls.finished_at.
 */
export type AnthropicStreamEvent =
  | { type: "text"; text: string }
  | {
      type: "tool_trace_start";
      id: string;
      toolName: string;
      input: unknown;
      startedAt: string;
    }
  | { type: "tool_trace_done"; id: string; finishedAt: string }
  | {
      type: "tool_trace_error";
      id: string;
      error: string;
      finishedAt: string;
    }
  | {
      type: "citation";
      url: string;
      title: string;
      citedText: string;
    };

/**
 * One block in the Anthropic system content array. cache_control marks a
 * cache breakpoint: content up to and including this block is cached
 * (5-minute ephemeral cache by default).
 */
export type AnthropicSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

/**
 * Tool definition passed in the request's tools array. v1 supports
 * Anthropic's hosted web_search server tool; future tools (calculator,
 * Drive read/write, custom org tools) implement their own variants.
 */
export type AnthropicTool = {
  type: "web_search_20250305";
  name: "web_search";
  max_uses?: number;
};

export type StreamAnthropicChatArgs = {
  /** Bare Anthropic model id (e.g. 'claude-sonnet-4-6'), no vendor prefix. */
  model: string;
  /**
   * System content as an array of text blocks. The caller composes the
   * preamble + agent prompt + attached references and places a single
   * cache_control marker on the last block to enable prefix caching.
   */
  systemBlocks: AnthropicSystemBlock[];
  /** Conversation history + current user turn, in Anthropic's role/content shape. */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  /** Server-side tool definitions to expose to the model (web search in v1). */
  tools?: AnthropicTool[];
};

export type StreamAnthropicChatResult = {
  /** Async iterable of typed events as the model streams. */
  events: AsyncIterable<AnthropicStreamEvent>;
  /**
   * Resolves once the stream completes; returns input/output token totals,
   * cache token totals, and web search request count. cache_creation_input_
   * tokens is non-zero on the turn that wrote the cache; cache_read_input_
   * tokens is non-zero on subsequent turns that hit the cache; both 0 when
   * caching was inactive (system below threshold, or no cache_control
   * marker). web_search_requests is the number of searches Claude ran on
   * this turn — capped server-side by tools[].max_uses (5 in v1).
   */
  finalUsage: () => Promise<{
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    web_search_requests: number;
  }>;
};

export function streamAnthropicChat(
  args: StreamAnthropicChatArgs,
): StreamAnthropicChatResult {
  const anthropic = createAnthropicClient();
  const stream = anthropic.messages.stream({
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.systemBlocks,
    messages: args.messages,
    ...(args.tools && args.tools.length > 0 ? { tools: args.tools } : {}),
  });

  async function* events(): AsyncIterable<AnthropicStreamEvent> {
    // Per-block bookkeeping. Anthropic's stream emits events in block order:
    // content_block_start → 0+ content_block_delta → content_block_stop.
    // The delta phase carries input_json_delta chunks for server_tool_use
    // blocks, so input is only complete at content_block_stop. Track
    // server_tool_use start metadata (id, name, partial_json) keyed by
    // block index, then emit tool_trace_start at stop with the
    // accumulated input. Errors on the matching web_search_tool_result
    // block emit tool_trace_error; success emits tool_trace_done.
    type PendingServerTool = {
      id: string;
      name: string;
      partialJson: string;
      startedAt: string;
    };
    const pendingByIndex = new Map<number, PendingServerTool>();

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "server_tool_use") {
            pendingByIndex.set(event.index, {
              id: block.id,
              name: block.name,
              partialJson: "",
              startedAt: new Date().toISOString(),
            });
          } else if (block.type === "web_search_tool_result") {
            // The result arrives in the start event itself for tool result
            // blocks (no input_json_delta phase). Emit done/error here.
            const finishedAt = new Date().toISOString();
            const content = block.content;
            if (
              content &&
              !Array.isArray(content) &&
              content.type === "web_search_tool_result_error"
            ) {
              yield {
                type: "tool_trace_error",
                id: block.tool_use_id,
                error: content.error_code,
                finishedAt,
              };
            } else {
              yield {
                type: "tool_trace_done",
                id: block.tool_use_id,
                finishedAt,
              };
            }
          }
          break;
        }
        case "content_block_delta": {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            yield { type: "text", text: delta.text };
          } else if (delta.type === "input_json_delta") {
            const pending = pendingByIndex.get(event.index);
            if (pending) {
              pending.partialJson += delta.partial_json;
            }
          } else if (delta.type === "citations_delta") {
            const citation = delta.citation;
            if (citation.type === "web_search_result_location") {
              if (citation.url) {
                yield {
                  type: "citation",
                  url: citation.url,
                  title: citation.title ?? citation.url,
                  citedText: citation.cited_text ?? "",
                };
              }
            }
          }
          break;
        }
        case "content_block_stop": {
          const pending = pendingByIndex.get(event.index);
          if (pending) {
            // Server_tool_use block finalized — input fully accumulated.
            // partial_json may be empty for tool calls with no inputs;
            // try-parse and fall back to {} so the route always sees a
            // structured value.
            let parsedInput: unknown = {};
            if (pending.partialJson.length > 0) {
              try {
                parsedInput = JSON.parse(pending.partialJson);
              } catch {
                // Malformed partial JSON would be an Anthropic bug; we'd
                // rather still surface the trace card with empty input
                // than swallow the entire tool call.
                parsedInput = { _raw: pending.partialJson };
              }
            }
            yield {
              type: "tool_trace_start",
              id: pending.id,
              toolName: pending.name,
              input: parsedInput,
              startedAt: pending.startedAt,
            };
            pendingByIndex.delete(event.index);
          }
          break;
        }
      }
    }
  }

  return {
    events: events(),
    finalUsage: async () => {
      const final = await stream.finalMessage();
      return {
        input_tokens: final.usage.input_tokens,
        output_tokens: final.usage.output_tokens,
        cache_creation_input_tokens:
          final.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
        web_search_requests:
          final.usage.server_tool_use?.web_search_requests ?? 0,
      };
    },
  };
}
