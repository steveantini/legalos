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
 * the SDK's finalMessage() promise for usage totals, and the model id
 * format Anthropic expects (the bare model name, never the vendor prefix —
 * the dispatcher strips the prefix via parseModelId before calling here).
 */

export type StreamAnthropicChatArgs = {
  /** Bare Anthropic model id (e.g. 'claude-sonnet-4-6'), no vendor prefix. */
  model: string;
  /** Full system prompt — preamble + agent prompt — already composed. */
  systemPrompt: string;
  /** Conversation history + current user turn, all in Anthropic's role/content shape. */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
};

export type StreamAnthropicChatResult = {
  /** Async iterable of text deltas as the model streams. */
  textDeltas: AsyncIterable<string>;
  /** Resolves once the stream completes; returns input/output token totals. */
  finalUsage: () => Promise<{ input_tokens: number; output_tokens: number }>;
};

export function streamAnthropicChat(
  args: StreamAnthropicChatArgs,
): StreamAnthropicChatResult {
  const anthropic = createAnthropicClient();
  const stream = anthropic.messages.stream({
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.systemPrompt,
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
      };
    },
  };
}
