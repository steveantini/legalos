import "server-only";

import { encodeSseEvent, SSE_RESPONSE_HEADERS } from "@/lib/llm/anthropic/stream";
import type { MessageRole } from "@/lib/llm/anthropic/types";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Stream a FIXED assistant message over SSE WITHOUT a model call, persisting it as
 * a normal assistant turn.
 *
 * Used by deterministic pre-step GUARDS: when a pre-step cannot run (for example, a
 * document-comparison agent was not given exactly two readable documents), the user
 * gets a clear, friendly reply with zero model cost and no speculative model turn.
 * The event shape (meta -> token -> done) matches streamChatTurn exactly, so the
 * chat client renders the guard identically to a model reply, and the message lands
 * in history like any other assistant turn. There is no usage_events row because no
 * model was called — the cost ledger stays honest.
 */
export function streamCannedAssistantTurn(params: {
  supabase: SupabaseServerClient;
  conversationId: string;
  userMessageId: string;
  text: string;
}): Response {
  const { supabase, conversationId, userMessageId, text } = params;

  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encodeSseEvent({
          type: "meta",
          conversation_id: conversationId,
          user_message_id: userMessageId,
        }),
      );
      controller.enqueue(encodeSseEvent({ type: "token", text }));

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role: "assistant" satisfies MessageRole,
          content: text,
          tokens_in: 0,
          tokens_out: 0,
          sources: [],
          tool_calls: [],
        })
        .select("id")
        .single();

      if (error || !data) {
        console.error("canned assistant message insert failed", {
          code: error?.code,
        });
        controller.enqueue(
          encodeSseEvent({ type: "error", error: "internal_error" }),
        );
        controller.close();
        return;
      }

      controller.enqueue(
        encodeSseEvent({
          type: "done",
          assistant_message_id: data.id,
          tokens_in: 0,
          tokens_out: 0,
        }),
      );
      controller.close();
    },
  });

  return new Response(sseStream, { headers: SSE_RESPONSE_HEADERS });
}
