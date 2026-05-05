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
  type ChatSource,
  type ChatToolCall,
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
 *   8. Stream from Anthropic, emitting:
 *        - token            text deltas (may include inline <sup ...> markers)
 *        - tool_trace_start  per server tool invocation
 *        - tool_trace_done   per matching tool result
 *        - tool_trace_error  per tool result error
 *        - source_added      per new citation URL (deduped within message)
 *   9. On stream end: persist assistant message (content + sources +
 *      tool_calls) + usage_events row, emit done event.
 *      On stream error: persist what we have so far so the conversation
 *      reload path doesn't lose accumulated state. tool_calls in flight
 *      stay at status="running"; emit error SSE and close.
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

/**
 * Generate a short opaque id (12 hex chars) prefixed with the given tag.
 * Used for source ids (`src_xxx`) and as a fallback for tool call ids
 * when Anthropic's tool_use_id is missing. Web Crypto's randomUUID is
 * available in Node 22 / Vercel runtime; takes the first 12 hex chars
 * of the dash-stripped UUID for a 48-bit random space — collision risk
 * within a single message (≤ tens of items) is negligible.
 */
function shortId(prefix: string): string {
  const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${hex}`;
}

/**
 * Extract a clean display domain from a URL: hostname stripped of a
 * leading "www.". Returns the input unchanged if URL parsing fails so
 * a malformed citation URL doesn't crash the stream.
 */
function domainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return url;
  }
}

/**
 * Citation-marker drain points for the deferred-injection pipeline
 * (Session 18c addendum). Anthropic's web_search emits citations_delta
 * BEFORE the cited text rather than after, so injecting markers at the
 * stream position lands pills in front of claims ("[1] The FTC banned…")
 * — frontier-product convention is markers AFTER the cited claim, after
 * the sentence-ending period.
 *
 * The pipeline buffers markers in a per-stream pendingCitations queue
 * and drains at the first match of this regex within a text chunk:
 *
 *   [.!?](?=\s|$)    — sentence-ending punctuation followed by space or
 *                      end of chunk
 *   (?=\n\n)         — paragraph break (zero-length lookahead so markers
 *                      land at end of paragraph, not start of next)
 *   (?=\n[*\-+] )    — bullet list-item start
 *   (?=\n#{1,6}\s)   — heading start
 *   (?=\n>\s)        — blockquote start
 *   (?=\n\d+\. )     — ordered list-item start
 *
 * Tool events (tool_trace_*) and end-of-stream also force a drain —
 * citations belong to text already emitted, never to text that hasn't
 * arrived yet.
 */
const CITATION_DRAIN_RE =
  /[.!?](?=\s|$)|(?=\n\n)|(?=\n[*\-+] )|(?=\n#{1,6}\s)|(?=\n>\s)|(?=\n\d+\. )/;

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
    }
    apiMessages.push({
      role: "user",
      content: wrapUserMessage(user_message),
    });

    // ---- Load active attachments (deterministic order for prefix caching)
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

    // ---- Tools whitelist (web_search v1)
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

    // ---- Vendor dispatch
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

        // ---- Stream-local accumulators ----
        // assistantText accumulates the full body, including inline
        // <sup data-source-id="..." /> markers injected at citation time.
        // sources / toolCalls are the records that will land on the
        // assistant message row at end-of-stream (or mid-stream error).
        // sourceByUrl dedups within-message: a URL appearing twice in
        // citations_delta still produces a single source record, but
        // each citation still emits its own <sup> marker pointing at
        // the existing source's id.
        let assistantText = "";
        const sources: ChatSource[] = [];
        const sourceByUrl = new Map<string, string>();
        const toolCalls: ChatToolCall[] = [];
        // Sources that arrived since the last finalized tool call. At
        // tool_trace_done emit time we move these into the matching
        // tool call's output.source_ids on the persisted record (live
        // SSE event still ships output.source_ids: [] per Step B
        // attribution-timing decision).
        let pendingSourceAttributions: string[] = [];
        let lastDoneToolCallIndex: number | null = null;
        // Citation markers awaiting injection (Session 18c addendum).
        // Citations queue here when their citations_delta arrives and
        // drain into assistantText / the SSE token stream at the next
        // sentence-ending punctuation, structural boundary, tool event,
        // or end-of-stream — so pills land AFTER cited claims rather
        // than before.
        let pendingCitations: string[] = [];

        function drainCitations() {
          if (pendingCitations.length === 0) return;
          // Dedup within drain — if Anthropic emits three citations to
          // the same source for one cited claim, render one pill, not
          // three. Stable insertion order across the dedup'd set.
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
            controller.enqueue(
              encodeSseEvent({ type: "token", text: markers }),
            );
          }
        }

        let tokensIn: number | null = null;
        let tokensOut: number | null = null;
        let cacheCreationTokens = 0;
        let cacheReadTokens = 0;
        let webSearchCount = 0;
        let streamError: Error | null = null;

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
              case "text": {
                // Defer-and-split: if any citations are queued and this
                // chunk contains a sentence-end / structural boundary,
                // emit chunk up-to-and-including the boundary, drain
                // markers there, then emit the tail. If no boundary
                // OR no pending citations, just emit the chunk.
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
                // Citations belong to text already emitted, never to
                // text that hasn't arrived yet — drain before any tool
                // boundary so pending pills land at the end of the
                // text block that just closed.
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
                  // Roll any source_ids that streamed since the previous
                  // done event into the previous tool call's output.
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
                // Queue marker for next drain point. Anthropic emits
                // citations_delta BEFORE the cited text rather than
                // after; injecting at stream position lands pills in
                // front of claims. Deferring to the next sentence-end /
                // paragraph break / tool boundary / end-of-stream lands
                // them in academic-citation position (after the period).
                pendingCitations.push(sourceId);
                break;
              }
            }
          }

          // End-of-stream drain: any citations queued after the last
          // sentence-end / boundary land at the current end of body
          // rather than dropping silently.
          drainCitations();

          const usage = await finalUsage();
          tokensIn = usage.input_tokens;
          tokensOut = usage.output_tokens;
          cacheCreationTokens = usage.cache_creation_input_tokens;
          cacheReadTokens = usage.cache_read_input_tokens;
          webSearchCount = usage.web_search_requests;
        } catch (err) {
          // Stream failed mid-flight. Per Step B "persist what we have so
          // far": fall through to the persistence block below with
          // whatever assistantText / sources / toolCalls accumulated.
          // Tool calls still in "running" stay that way — that's honest
          // about the stream state at termination.
          streamError = err instanceof Error ? err : new Error(String(err));
          console.error("model stream failed", err);
          // Drain any pending citations into the partial body so the
          // persisted assistantText has its markers in (approximately)
          // the right place even on interrupt.
          drainCitations();
        }

        // Final source-attribution flush: any sources accumulated after
        // the last tool_trace_done belong to that call.
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

        // 3. Persist assistant message — full body + sources + tool_calls.
        // Persist even on stream error so reload reflects partial state.
        const { data: assistantMsg, error: assistantInsertErr } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant" satisfies MessageRole,
            content: assistantText,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            sources,
            tool_calls: toolCalls,
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

        // If the stream errored mid-flight, surface error then close —
        // skip usage_events (we don't have final usage) and skip done.
        if (streamError) {
          controller.enqueue(
            encodeSseEvent({ type: "error", error: "upstream_error" }),
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
