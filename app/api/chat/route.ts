import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  streamAnthropicChat,
  type AnthropicSystemBlock,
  type AnthropicStreamEvent,
  type AnthropicTool,
} from "@/lib/llm/anthropic/chat";
import {
  buildSystemPrompt,
  wrapUserMessage,
} from "@/lib/llm/anthropic/prompt-defense";
import {
  encodeSseEvent,
  SSE_RESPONSE_HEADERS,
} from "@/lib/llm/anthropic/stream";
import type { MessageRole, NativeAgent } from "@/lib/llm/anthropic/types";
import { parseModelId } from "@/lib/llm/parse-model-id";
import { computeCostMicroUsd } from "@/lib/llm/pricing";
import { checkChatRateLimit } from "@/lib/llm/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Phase 2 native-agent chat endpoint per DECISION_LOG D-023.
 *
 * Flow (every step server-side; key never reaches the client):
 *   1. getUser() from the Supabase server client → 401 on no session.
 *   2. Zod-validate body shape + length + control-char strip → 400.
 *   3. Load + verify the agent (active, native, has prompt + model).
 *   4. Verify department access via has_department_access RPC → 403.
 *   5. Per-user rate limit (20 msgs/min) → 429.
 *   6. Resolve / create conversation; snapshot system_prompt + model
 *      at conversation creation per AI Integration Rules.
 *   7. Insert user message; emit SSE meta event.
 *   8. Stream from Anthropic, emit token events as text deltas arrive.
 *   9. On stream end: persist assistant message + usage_events row,
 *      emit done event. Mid-stream errors emit an error event and
 *      close the stream cleanly.
 *
 * The user-scoped Supabase server client is used throughout (not the
 * service-role key), so RLS remains the last line of defense per D-009.
 *
 * Error responses are JSON discriminated unions per CLAUDE.md
 * conventions: { ok: false, error: <code> }. Internal details are
 * logged server-side and never leak to the client.
 */

export const runtime = "nodejs";
// Anthropic streams can take time. Vercel's default is 300s (per April-2026
// platform notes); a chat call will close well inside that.
export const maxDuration = 300;

const chatRequestSchema = z.object({
  agent_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  user_message: z
    .string()
    .trim()
    .min(1)
    .max(10_000)
    .refine(
      // Reject control characters except \t, \n, \r. Hardens against
      // zero-width / spoofing tricks at the Zod layer; the structural
      // <user_input> wrapping is the primary injection defense.
      (s) => !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(s),
      { message: "User message contains disallowed control characters" },
    ),
});

type ChatErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "agent_not_found"
  | "agent_not_native"
  | "invalid_input"
  | "rate_limited"
  | "upstream_error"
  | "internal_error";

function errorResponse(error: ChatErrorCode, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return errorResponse("unauthenticated", 401);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse("invalid_input", 400);
    }
    const parsed = chatRequestSchema.safeParse(rawBody);
    if (!parsed.success) return errorResponse("invalid_input", 400);
    const { agent_id, conversation_id, user_message } = parsed.data;

    // ---- Load + verify agent
    const { data: agentRow, error: agentErr } = await supabase
      .from("agents")
      .select(
        "id, organization_id, department_id, slug, name, type, system_prompt, model, is_active, tools_enabled",
      )
      .eq("id", agent_id)
      .eq("is_active", true)
      .maybeSingle();
    if (agentErr) {
      console.error("agents fetch failed", { code: agentErr.code });
      return errorResponse("internal_error", 500);
    }
    if (!agentRow) return errorResponse("agent_not_found", 404);
    if (agentRow.type !== "native") return errorResponse("agent_not_native", 404);
    if (!agentRow.system_prompt || !agentRow.model) {
      // Should be enforced by the agents_native_requires_prompt CHECK
      // constraint in 0001; defend at the application layer too.
      console.error("native agent missing prompt or model", {
        agent_id: agentRow.id,
      });
      return errorResponse("internal_error", 500);
    }
    const agent = agentRow as NativeAgent;

    // ---- Verify department access
    const { data: hasAccess, error: accessErr } = await supabase.rpc(
      "has_department_access",
      { dept_id: agent.department_id },
    );
    if (accessErr) {
      console.error("has_department_access rpc failed", {
        code: accessErr.code,
      });
      return errorResponse("internal_error", 500);
    }
    if (!hasAccess) return errorResponse("forbidden", 403);

    // ---- Rate limit
    const rl = await checkChatRateLimit(supabase, user.id);
    if (!rl.allowed) return errorResponse("rate_limited", 429);

    // ---- Resolve / create conversation; gather prior history if any
    let conversationId: string;
    let systemPromptSnapshot: string;
    let modelSnapshot: string;
    let priorMessages: Array<{ role: MessageRole; content: string }> = [];

    if (conversation_id) {
      const { data: convo, error: convoErr } = await supabase
        .from("conversations")
        .select("id, user_id, system_prompt_snapshot, model_snapshot")
        .eq("id", conversation_id)
        .maybeSingle();
      if (convoErr) {
        console.error("conversation fetch failed", { code: convoErr.code });
        return errorResponse("internal_error", 500);
      }
      if (!convo || convo.user_id !== user.id) {
        // Either the conversation does not exist or it belongs to another
        // user. Collapse both cases to forbidden so we don't leak existence.
        return errorResponse("forbidden", 403);
      }
      conversationId = convo.id;
      systemPromptSnapshot = convo.system_prompt_snapshot;
      modelSnapshot = convo.model_snapshot;

      const { data: history, error: historyErr } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (historyErr) {
        console.error("history fetch failed", { code: historyErr.code });
        return errorResponse("internal_error", 500);
      }
      priorMessages = (history ?? []) as Array<{
        role: MessageRole;
        content: string;
      }>;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("conversations")
        .insert({
          organization_id: agent.organization_id,
          user_id: user.id,
          agent_id: agent.id,
          system_prompt_snapshot: agent.system_prompt,
          model_snapshot: agent.model,
        })
        .select("id, system_prompt_snapshot, model_snapshot")
        .single();
      if (createErr || !created) {
        console.error("conversation insert failed", {
          code: createErr?.code,
        });
        return errorResponse("internal_error", 500);
      }
      conversationId = created.id;
      systemPromptSnapshot = created.system_prompt_snapshot;
      modelSnapshot = created.model_snapshot;
    }

    // ---- Insert user message
    const { data: userMsg, error: userMsgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "user" satisfies MessageRole,
        content: user_message,
      })
      .select("id")
      .single();
    if (userMsgErr || !userMsg) {
      console.error("user message insert failed", {
        code: userMsgErr?.code,
      });
      return errorResponse("internal_error", 500);
    }

    // ---- Build Anthropic messages array
    // Strategy: replay history in role order, re-wrapping every user turn
    // (current and historical) in <user_input> delimiter tags. Persisted
    // content stores the raw text — wrapping is a runtime concern that
    // applies on every send so the prompt-injection structure is
    // consistent across multi-turn conversations.
    const apiMessages: Array<{
      role: "user" | "assistant";
      content: string;
    }> = [];
    for (const m of priorMessages) {
      if (m.role === "user") {
        apiMessages.push({ role: "user", content: wrapUserMessage(m.content) });
      } else if (m.role === "assistant") {
        apiMessages.push({ role: "assistant", content: m.content });
      }
      // Skip "system" role messages — the system prompt is passed via the
      // system parameter, not as a turn.
    }
    apiMessages.push({
      role: "user",
      content: wrapUserMessage(user_message),
    });

    // Load the agent's active attachments to include in the system
    // content. ORDER BY created_at ASC keeps the block sequence
    // deterministic across turns — required for prefix caching to hit
    // (a different ordering would change the cached prefix and force
    // a re-write each turn). Per architecture §3 / Decision B, we use
    // the LIVE attachments at send time, not a per-conversation
    // snapshot — conversations are immutable transcripts of what the
    // model said, but the configuration that produced them (system
    // prompt, attachments) reflects the agent's current state.
    // Attachments where extracted_text is null (failed extraction)
    // are skipped — they exist as files in storage and rows in the
    // table, but contribute no model context.
    const { data: attRows, error: attErr } = await supabase
      .from("agent_attachments")
      .select("original_filename, extracted_text")
      .eq("agent_id", agent.id)
      .is("deleted_at", null)
      .not("extracted_text", "is", null)
      .order("created_at", { ascending: true });
    if (attErr) {
      console.error("agent_attachments fetch failed", { code: attErr.code });
      return errorResponse("internal_error", 500);
    }

    // Build the system content as an array of text blocks with a single
    // cache_control marker on the last block. Content up to and including
    // the marker is cached for ~5 minutes (architecture §1). Below
    // Anthropic's threshold (~1024 tokens for Sonnet/Opus, ~2048 for
    // Haiku), the marker is a no-op — cache_creation_input_tokens and
    // cache_read_input_tokens both come back as 0, which is correct
    // behavior, not a bug. Cost math still works in that case
    // because pricing.ts charges 0 × any-rate = 0.
    const systemBlocks: AnthropicSystemBlock[] = [
      { type: "text", text: buildSystemPrompt(systemPromptSnapshot) },
      ...(attRows ?? []).map((att) => ({
        type: "text" as const,
        text: `<attachment filename="${att.original_filename}">\n${att.extracted_text}\n</attachment>`,
      })),
    ];
    systemBlocks[systemBlocks.length - 1] = {
      ...systemBlocks[systemBlocks.length - 1],
      cache_control: { type: "ephemeral" },
    };

    // Build the tools array from the agent's tools_enabled JSONB.
    // v1's catalog is one entry: web_search (Anthropic's hosted server
    // tool). The whitelist below validates the agent's toggle against
    // known tool ids — anything not in the catalog is silently dropped
    // rather than passed through to Anthropic, which would 400 on an
    // unknown tool type.
    const enabledTools = Array.isArray(agentRow.tools_enabled)
      ? (agentRow.tools_enabled as unknown as string[])
      : [];
    const tools: AnthropicTool[] = [];
    if (enabledTools.includes("web_search")) {
      tools.push({
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      });
    }

    // Parse the vendor-prefixed model id snapshot. Single-case dispatcher
    // today (anthropic only); sibling adapters land in Phase 6 per D-025.
    // A parse failure here is a configuration bug, not a runtime upstream
    // error — return a clean JSON 500 before opening the SSE stream so the
    // client doesn't see a meta event followed immediately by an error.
    let parsedModel;
    try {
      parsedModel = parseModelId(modelSnapshot);
    } catch (err) {
      console.error("parseModelId failed", {
        conversation_id: conversationId,
        err: err instanceof Error ? err.message : String(err),
      });
      return errorResponse("internal_error", 500);
    }
    const { vendor, model: vendorModelName } = parsedModel;

    // Capture metadata into closure for the stream callback.
    const sseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // 1. Emit the meta event up-front so the client knows the IDs.
        controller.enqueue(
          encodeSseEvent({
            type: "meta",
            conversation_id: conversationId,
            user_message_id: userMsg.id,
          }),
        );

        let assistantText = "";
        let tokensIn: number | null = null;
        let tokensOut: number | null = null;
        let cacheCreationTokens = 0;
        let cacheReadTokens = 0;
        let webSearchCount = 0;

        // 2. Dispatch to the right vendor adapter and stream. On any
        //    failure, emit an error event and close the stream. The user
        //    message stays persisted; the assistant message is not
        //    inserted, leaving the conversation in a "user spoke, no
        //    reply" state that 8b's UI can present as a regenerate option.
        try {
          let events: AsyncIterable<AnthropicStreamEvent>;
          let finalUsage: () => Promise<{
            input_tokens: number;
            output_tokens: number;
            cache_creation_input_tokens: number;
            cache_read_input_tokens: number;
            web_search_requests: number;
          }>;

          switch (vendor) {
            case "anthropic": {
              const r = streamAnthropicChat({
                model: vendorModelName,
                systemBlocks,
                messages: apiMessages,
                maxTokens: 4096,
                tools: tools.length > 0 ? tools : undefined,
              });
              events = r.events;
              finalUsage = r.finalUsage;
              break;
            }
            default:
              throw new Error(`Unsupported model vendor: ${vendor}`);
          }

          for await (const event of events) {
            switch (event.type) {
              case "text":
                assistantText += event.text;
                controller.enqueue(
                  encodeSseEvent({ type: "token", text: event.text }),
                );
                break;
              case "tool_use_start":
                controller.enqueue(
                  encodeSseEvent({
                    type: "tool_use_start",
                    tool_name: event.toolName,
                  }),
                );
                break;
              case "tool_use_end":
                controller.enqueue(encodeSseEvent({ type: "tool_use_end" }));
                break;
              case "citations":
                controller.enqueue(
                  encodeSseEvent({
                    type: "citations",
                    citations: event.citations,
                  }),
                );
                break;
            }
          }

          const usage = await finalUsage();
          tokensIn = usage.input_tokens;
          tokensOut = usage.output_tokens;
          cacheCreationTokens = usage.cache_creation_input_tokens;
          cacheReadTokens = usage.cache_read_input_tokens;
          webSearchCount = usage.web_search_requests;
        } catch (err) {
          console.error("model stream failed", err);
          controller.enqueue(
            encodeSseEvent({ type: "error", error: "upstream_error" }),
          );
          controller.close();
          return;
        }

        // 3. Persist assistant message.
        const { data: assistantMsg, error: assistantInsertErr } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant" satisfies MessageRole,
            content: assistantText,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
          })
          .select("id")
          .single();
        if (assistantInsertErr || !assistantMsg) {
          console.error("assistant message insert failed", {
            code: assistantInsertErr?.code,
          });
          controller.enqueue(
            encodeSseEvent({ type: "error", error: "internal_error" }),
          );
          controller.close();
          return;
        }

        // 4. Persist usage event. tokensIn / tokensOut are non-null here
        //    because the try block above guarantees finalMessage() ran.
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

        const { error: usageErr } = await supabase.from("usage_events").insert({
          organization_id: agent.organization_id,
          user_id: user.id,
          agent_id: agent.id,
          conversation_id: conversationId,
          message_id: assistantMsg.id,
          model: modelSnapshot,
          tokens_in: tokensIn!,
          tokens_out: tokensOut!,
          cache_creation_tokens: cacheCreationTokens,
          cache_read_tokens: cacheReadTokens,
          web_search_count: webSearchCount,
          cost_micro_usd: costMicroUsd,
        });
        if (usageErr) {
          // Do not fail the user-facing stream over a ledger insert error.
          // Phase 7 observability will surface ledger gaps via reconciliation.
          console.error("usage_events insert failed", {
            code: usageErr.code,
          });
        }

        // 5. Done.
        controller.enqueue(
          encodeSseEvent({
            type: "done",
            assistant_message_id: assistantMsg.id,
            tokens_in: tokensIn!,
            tokens_out: tokensOut!,
          }),
        );
        controller.close();
      },
    });

    return new Response(sseStream, { headers: SSE_RESPONSE_HEADERS });
  } catch (err) {
    console.error("/api/chat unexpected error", err);
    return errorResponse("internal_error", 500);
  }
}
