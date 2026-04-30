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
 * 8j refactored the contract from a text-only AsyncIterable<string> to a
 * discriminated AsyncIterable<AnthropicStreamEvent> so the route can
 * surface tool-use indicators and citations from Anthropic's web search
 * tool. The events contract is vendor-agnostic in shape; per-vendor
 * specifics (which content_block types map to which event kind) stay
 * inside each adapter.
 */

/** A citation Anthropic attaches to a text block when web search was used. */
export type AnthropicCitation = {
  url: string;
  title: string;
  cited_text: string;
};

/**
 * Discriminated stream event surfaced from the Anthropic SDK loop.
 *
 *   - `text`           — text delta to append to the assistant bubble
 *   - `tool_use_start` — server-side tool invocation began (web search)
 *   - `tool_use_end`   — model resumed text generation; clear indicator
 *   - `citations`      — emitted once at end-of-stream with all citations
 *                        gathered across every text block in the response
 *
 * Per the 8j plan: tool_use_start/end track a single contiguous "in
 * tool-use" interval — back-to-back searches don't flicker the indicator,
 * and a message_stop while still in tool-use emits a fallback tool_use_end
 * so the UI never gets stuck on the "Searching..." state.
 */
export type AnthropicStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_use_start"; toolName: string }
  | { type: "tool_use_end" }
  | { type: "citations"; citations: AnthropicCitation[] };

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
    // Track whether we're currently inside a server-tool block (server_tool_use
    // OR web_search_tool_result). The indicator should stay continuously on
    // across back-to-back search → result → search → result cycles, only
    // clearing when text content begins. message_stop is a fallback for the
    // case where the model decides search alone answered the question and
    // emits no trailing text.
    let inToolUse = false;
    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start": {
          const blockType = event.content_block.type;
          if (
            blockType === "server_tool_use" ||
            blockType === "web_search_tool_result"
          ) {
            if (!inToolUse) {
              inToolUse = true;
              yield { type: "tool_use_start", toolName: "web_search" };
            }
          } else if (blockType === "text") {
            if (inToolUse) {
              inToolUse = false;
              yield { type: "tool_use_end" };
            }
          }
          break;
        }
        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield { type: "text", text: event.delta.text };
          }
          break;
        case "message_stop":
          if (inToolUse) {
            inToolUse = false;
            yield { type: "tool_use_end" };
          }
          break;
      }
    }

    // Once the stream loop has drained, finalMessage() resolves immediately
    // with the cached final assembly. Walk every text block and pull
    // citations Anthropic attached when web search produced cited results.
    const final = await stream.finalMessage();
    const citations: AnthropicCitation[] = [];
    for (const block of final.content) {
      if (block.type !== "text" || !block.citations) continue;
      for (const c of block.citations) {
        if (c.type === "web_search_result_location") {
          if (!c.url) continue; // skip degenerate citations with no link
          citations.push({
            url: c.url,
            title: c.title ?? c.url,
            cited_text: c.cited_text ?? "",
          });
        }
      }
    }
    if (citations.length > 0) {
      yield { type: "citations", citations };
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
