import "server-only";

import { createAnthropicClient } from "./client";

/**
 * Anthropic streaming-chat adapter per docs/AGENT_ARCHITECTURE.md §6.
 *
 * Returns a uniform { textDeltas, finalUsage } shape that the dispatcher in
 * app/api/chat/route.ts consumes. Future vendor adapters (OpenAI, Google
 * — Phase 6 per D-025) implement the same return shape so adding a sibling
 * adapter is a new file plus a new case in the dispatcher's switch, with
 * no change to the route handler's stream-consumption code.
 *
 * Anthropic-specific concerns owned by this adapter: the Anthropic SDK
 * stream protocol (content_block_delta events with text_delta payloads),
 * the SDK's finalMessage() promise for usage totals, the system-blocks-
 * with-cache-control shape for prompt caching (architecture §1), and the
 * model id format Anthropic expects (the bare model name, never the
 * vendor prefix — the dispatcher strips the prefix via parseModelId
 * before calling here).
 *
 * Caching is the caller's responsibility — the adapter is a dumb pass-
 * through. The route builds the system blocks with cache_control markers
 * already attached. Other vendors' caching strategies live in their own
 * adapter files.
 */

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

export type StreamAnthropicChatArgs = {
  /** Bare Anthropic model id (e.g. 'claude-sonnet-4-6'), no vendor prefix. */
  model: string;
  /**
   * System content as an array of text blocks. The caller composes the
   * preamble + agent prompt + attached references and places a single
   * cache_control marker on the last block to enable prefix caching. An
   * array with a single block is fine; the marker is a no-op when the
   * cumulative block content is below Anthropic's caching threshold
   * (~1024 tokens for Sonnet/Opus, ~2048 for Haiku).
   */
  systemBlocks: AnthropicSystemBlock[];
  /** Conversation history + current user turn, in Anthropic's role/content shape. */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
};

export type StreamAnthropicChatResult = {
  /** Async iterable of text deltas as the model streams. */
  textDeltas: AsyncIterable<string>;
  /**
   * Resolves once the stream completes; returns input/output token totals
   * plus cache token totals. cache_creation_input_tokens is non-zero on
   * the turn that wrote the cache; cache_read_input_tokens is non-zero on
   * subsequent turns that hit the cache. Both 0 when caching was inactive
   * (system below threshold, or no cache_control marker).
   */
  finalUsage: () => Promise<{
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
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
  });

  async function* textDeltas(): AsyncIterable<string> {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }

  return {
    textDeltas: textDeltas(),
    finalUsage: async () => {
      const final = await stream.finalMessage();
      return {
        input_tokens: final.usage.input_tokens,
        output_tokens: final.usage.output_tokens,
        cache_creation_input_tokens:
          final.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
      };
    },
  };
}
