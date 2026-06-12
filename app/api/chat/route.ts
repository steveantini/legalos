import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_BYTES } from "@/lib/actions/_attachment-shared";
import { resolveGatedOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import { resolveAttachmentText } from "@/lib/connections/attachment-content";
import { getVisibleCollections } from "@/lib/knowledge/collections-data";
import { buildResearchToolDef } from "@/lib/knowledge/research/inline";
import { ALLOWED_MIME_TYPES, extractText } from "@/lib/extract/extract";
import {
  type AnthropicSystemBlock,
  type AnthropicTool,
} from "@/lib/llm/anthropic/chat";
import {
  buildSystemPrompt,
  wrapUserMessage,
} from "@/lib/llm/anthropic/prompt-defense";
import type { MessageRole, NativeAgent } from "@/lib/llm/anthropic/types";
import { streamChatTurn } from "@/lib/chat/assistant-stream";
import { parseModelId } from "@/lib/llm/parse-model-id";
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

// Aggregate cap on extracted attachment text across all of a message's
// attachments (D-055), enforced at send. Per-file extraction already truncates
// at 100k chars; this bounds the sum so several large files can't blow up the
// prompt and its cost.
const ATTACHMENT_AGGREGATE_CHAR_BUDGET = 250_000;

// The MCP agentic loop, citation draining, tool-trace summarization, and stream
// persistence (including the 2P-7b write-confirmation pause) live in
// lib/chat/assistant-stream.ts, shared with the resume path (/api/chat/confirm).

// A per-message attachment riding the send payload. Disjoint by shape: an
// uploaded local file carries a storage_path (re-extracted from Storage
// server-side); a connected-Drive file carries source_type:'gdrive_link' + a
// file id and is resolved LIVE at run-time (never uploaded or extracted at
// send). The Drive mime_type is a free string — it may be a native Google type
// (e.g. application/vnd.google-apps.document), exported at fetch time, so the
// upload allowlist does not apply to it here.
const uploadAttachmentSchema = z.object({
  storage_path: z.string().min(1).max(1024),
  original_filename: z.string().min(1).max(512),
  content_type: z.enum(ALLOWED_MIME_TYPES),
  size_bytes: z.number().int().positive().max(MAX_BYTES),
});

const driveAttachmentSchema = z.object({
  source_type: z.literal("gdrive_link"),
  file_id: z.string().min(1).max(512),
  name: z.string().min(1).max(512),
  mime_type: z.string().min(1).max(255),
});

type UploadAttachmentItem = z.infer<typeof uploadAttachmentSchema>;
type DriveAttachmentItem = z.infer<typeof driveAttachmentSchema>;

const chatRequestSchema = z.object({
  agent_id: z.string().uuid(),
  // Optional client pre-allocation (Stage 4 composer supplies it; legacy
  // payloads don't). Stays nullable for back-compat: when absent the route
  // server-generates the id, preserving today's behavior. When supplied it may
  // be a fresh id or an existing owned conversation to continue.
  conversation_id: z.string().uuid().nullable(),
  // Optional client pre-allocation so message attachments can be uploaded under
  // <user>/<conversation>/<message>/ before the send round-trip. When absent
  // (legacy payloads) the user message falls back to the DB default id
  // (gen_random_uuid()); when supplied the route inserts the message with it.
  message_id: z.string().uuid().optional(),
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
  // Per-message attachment references. The client uploads each file via
  // uploadMessageAttachmentAction (which returns this metadata), holds it in
  // pending state, and passes it here on send. extracted_text is intentionally
  // NOT accepted from the client — the route re-extracts from Storage (trusted
  // source). Capped at 5; the aggregate text budget is enforced after
  // extraction.
  attachments: z
    .array(z.union([uploadAttachmentSchema, driveAttachmentSchema]))
    .max(5)
    .default([]),
});

type ChatErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "agent_not_found"
  | "agent_not_native"
  | "invalid_input"
  | "rate_limited"
  | "upstream_error"
  | "internal_error"
  | "conversation_id_conflict"
  | "message_id_conflict"
  | "invalid_attachment"
  | "attachments_too_large";

function errorResponse(error: ChatErrorCode, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Escape a string for safe inclusion inside an XML-style double-quoted
 * attribute. The attachment filename is user-supplied and could contain `"`,
 * `&`, or angle brackets that would otherwise break the
 * <attachment filename="..."> framing the model relies on to delimit the file.
 * `&` is escaped first so the entities introduced by the later replacements
 * are not double-escaped.
 */
function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A message_attachments row as the loader needs it, source-aware. */
type MessageAttachmentRow = {
  original_filename: string;
  extracted_text: string | null;
  source_type: string | null;
  source_metadata: unknown;
};

/**
 * Load a message's attachment rows for block assembly, tolerant of migration
 * 0046 (the Drive columns) not yet being applied. Selects source_type +
 * source_metadata; if those columns don't exist yet (Postgres 42703), falls
 * back to the legacy column set and treats every row as an upload — so the
 * upload path keeps working before the migration lands. This transitional
 * fallback can be removed once 0046 is confirmed applied. Returns null on a hard
 * error (the caller drops the message and returns 500).
 */
async function loadMessageAttachmentRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  messageId: string,
): Promise<MessageAttachmentRow[] | null> {
  const withSource = await supabase
    .from("message_attachments")
    .select("original_filename, extracted_text, source_type, source_metadata")
    .eq("message_id", messageId)
    .order("created_at", { ascending: true });

  if (!withSource.error) {
    return (withSource.data ?? []) as MessageAttachmentRow[];
  }

  if (withSource.error.code === "42703") {
    const legacy = await supabase
      .from("message_attachments")
      .select("original_filename, extracted_text")
      .eq("message_id", messageId)
      .order("created_at", { ascending: true });
    if (legacy.error) {
      console.error("message_attachments fetch failed", {
        code: legacy.error.code,
      });
      return null;
    }
    return (legacy.data ?? []).map((row) => {
      const r = row as { original_filename: string; extracted_text: string | null };
      return {
        original_filename: r.original_filename,
        extracted_text: r.extracted_text,
        source_type: null,
        source_metadata: null,
      };
    });
  }

  console.error("message_attachments fetch failed", {
    code: withSource.error.code,
  });
  return null;
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
    const { agent_id, conversation_id, message_id, user_message, attachments } =
      parsed.data;

    // Partition by source: uploads are persisted + re-extracted from Storage as
    // before; Drive items become gdrive_link rows resolved live at run-time. The
    // two are disjoint by shape (uploads carry storage_path).
    const uploadAttachments = attachments.filter(
      (att): att is UploadAttachmentItem => "storage_path" in att,
    );
    const driveAttachments = attachments.filter(
      (att): att is DriveAttachmentItem => !("storage_path" in att),
    );

    // Validate upload ownership up front — before any inserts — so a bad
    // storage_path fails fast without leaving an orphan message row. Storage
    // RLS would also block a foreign path, but the early reject is clearer and
    // cheaper. Drive items have no storage_path; their access is gated at
    // run-time by canExerciseCapability in the resolver.
    for (const att of uploadAttachments) {
      if (att.storage_path.split("/")[0] !== user.id) {
        return errorResponse("invalid_attachment", 400);
      }
    }

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

    // The client may pre-allocate a conversation id (Stage 4 composer) or omit
    // it (legacy payloads). When present it may reference an existing owned
    // conversation to continue, or be a fresh id; try to load it first. A hit
    // reuses it; a miss — or no id at all — creates a new conversation, using
    // the client id when supplied and a server-generated one otherwise. RLS
    // scopes the fetch to the user's own conversations.
    let existingConvo:
      | {
          id: string;
          user_id: string;
          system_prompt_snapshot: string;
          model_snapshot: string;
        }
      | null = null;
    if (conversation_id) {
      const { data, error: convoFetchErr } = await supabase
        .from("conversations")
        .select("id, user_id, system_prompt_snapshot, model_snapshot")
        .eq("id", conversation_id)
        .maybeSingle();
      if (convoFetchErr) {
        console.error("conversation fetch failed", {
          code: convoFetchErr.code,
        });
        return errorResponse("internal_error", 500);
      }
      existingConvo = data;
    }

    if (existingConvo) {
      // Existing conversation must be owned by the requester. RLS already
      // scopes the read; the explicit check is defense in depth and preserves
      // the prior 403-on-foreign behavior.
      if (existingConvo.user_id !== user.id) {
        return errorResponse("forbidden", 403);
      }
      conversationId = existingConvo.id;
      systemPromptSnapshot = existingConvo.system_prompt_snapshot;
      modelSnapshot = existingConvo.model_snapshot;

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
      // New conversation: use the client-supplied id when present, else
      // server-generate (back-compat with today's composer).
      const conversationIdToInsert = conversation_id ?? crypto.randomUUID();
      const { data: created, error: createErr } = await supabase
        .from("conversations")
        .insert({
          id: conversationIdToInsert,
          organization_id: agent.organization_id,
          user_id: user.id,
          agent_id: agent.id,
          system_prompt_snapshot: agent.system_prompt,
          model_snapshot: agent.model,
        })
        .select("id, system_prompt_snapshot, model_snapshot")
        .single();
      if (createErr || !created) {
        // 23505 = unique_violation: a client-supplied id already exists (a
        // race, or a foreign conversation hidden from the RLS-scoped fetch).
        if (createErr?.code === "23505") {
          return errorResponse("conversation_id_conflict", 409);
        }
        console.error("conversation insert failed", { code: createErr?.code });
        return errorResponse("internal_error", 500);
      }
      conversationId = created.id;
      systemPromptSnapshot = created.system_prompt_snapshot;
      modelSnapshot = created.model_snapshot;
    }

    // ---- Insert user message. Use the client-supplied id when present (Stage
    // 4 composer pre-allocates it for attachment paths); otherwise let the DB
    // default (gen_random_uuid()) fire, preserving today's composer behavior.
    const { data: userMsg, error: userMsgErr } = await supabase
      .from("messages")
      .insert({
        ...(message_id ? { id: message_id } : {}),
        conversation_id: conversationId,
        role: "user" satisfies MessageRole,
        content: user_message,
      })
      .select("id")
      .single();
    if (userMsgErr || !userMsg) {
      // 23505 = unique_violation on a client-supplied message id.
      if (userMsgErr?.code === "23505") {
        return errorResponse("message_id_conflict", 409);
      }
      console.error("user message insert failed", {
        code: userMsgErr?.code,
      });
      return errorResponse("internal_error", 500);
    }
    // Source of truth from here on, whether client-supplied or DB-generated.
    const canonicalMessageId = userMsg.id;

    // ---- Build Anthropic messages array (prior turns first)
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

    // ---- Persist upload-backed message-attachment rows, then repopulate their
    // text from the trusted Storage object. The client passed back upload
    // metadata, but its extracted_text is never trusted: we re-read each object
    // and re-run extraction server-side. (storage_path ownership was validated
    // up front.) This insert is byte-for-byte unchanged from before and sets no
    // Drive columns, so it stays safe before migration 0046 is applied.
    if (uploadAttachments.length > 0) {
      const { error: insertAttErr } = await supabase
        .from("message_attachments")
        .insert(
          uploadAttachments.map((att) => ({
            message_id: canonicalMessageId,
            user_id: user.id,
            organization_id: agent.organization_id,
            storage_path: att.storage_path,
            original_filename: att.original_filename,
            content_type: att.content_type,
            size_bytes: att.size_bytes,
            // extracted_text repopulated below from the Storage object.
          })),
        );
      if (insertAttErr) {
        console.error("message_attachments insert failed", {
          code: insertAttErr.code,
        });
        // No orphan: drop the just-inserted message so the user can retry.
        await supabase.from("messages").delete().eq("id", canonicalMessageId);
        return errorResponse("internal_error", 500);
      }

      for (const att of uploadAttachments) {
        const { data: blob } = await supabase.storage
          .from("message-attachments")
          .download(att.storage_path);
        if (!blob) continue; // object missing (deleted between upload + send)
        const buffer = Buffer.from(await blob.arrayBuffer());
        const extraction = await extractText(buffer, att.content_type);
        if (extraction.ok) {
          await supabase
            .from("message_attachments")
            .update({ extracted_text: extraction.text })
            .eq("message_id", canonicalMessageId)
            .eq("storage_path", att.storage_path);
        }
      }
    }

    // ---- Persist Drive-backed message-attachment rows (M6b). No upload or
    // extraction: the content is resolved LIVE at run-time by the resolver. The
    // row carries source_type='gdrive_link' and { fileId, name, mimeType } in
    // source_metadata; storage_path holds a non-null gdrive: marker (the column
    // is NOT NULL); extracted_text stays null. This insert references the Drive
    // columns added by migration 0046, so it only runs when the payload actually
    // carries Drive items (which require M6c's picker), keeping uploads safe
    // before the migration is applied.
    if (driveAttachments.length > 0) {
      const { error: insertDriveErr } = await supabase
        .from("message_attachments")
        .insert(
          driveAttachments.map((att) => ({
            message_id: canonicalMessageId,
            user_id: user.id,
            organization_id: agent.organization_id,
            storage_path: `gdrive:${att.file_id}`,
            original_filename: att.name,
            content_type: att.mime_type,
            size_bytes: 0,
            source_type: "gdrive_link",
            source_metadata: {
              fileId: att.file_id,
              name: att.name,
              mimeType: att.mime_type,
            },
          })),
        );
      if (insertDriveErr) {
        console.error("message_attachments drive insert failed", {
          code: insertDriveErr.code,
        });
        await supabase.from("messages").delete().eq("id", canonicalMessageId);
        return errorResponse("internal_error", 500);
      }
    }

    // ---- Load the message attachments' text + enforce the aggregate budget.
    // Soft cap checked here (not at upload) because only the send sees the full
    // set: a user may attach several small files and one large one.
    let messageAttachmentBlocks = "";
    if (attachments.length > 0) {
      const msgAttRows = await loadMessageAttachmentRows(
        supabase,
        canonicalMessageId,
      );
      if (msgAttRows === null) {
        await supabase.from("messages").delete().eq("id", canonicalMessageId);
        return errorResponse("internal_error", 500);
      }

      // Aggregate budget over the uploads' cached text. Drive rows have null
      // extracted_text (their content is fetched during block assembly, per
      // file truncated to ATTACHMENT_TEXT_LIMIT), so they don't count here —
      // matching the agent-attachment path, which also caps live content
      // per-file rather than against this message-level aggregate.
      const totalChars = msgAttRows.reduce(
        (sum, row) => sum + (row.extracted_text?.length ?? 0),
        0,
      );
      if (totalChars > ATTACHMENT_AGGREGATE_CHAR_BUDGET) {
        // Drop the message (cascades the attachment rows) so the user can
        // remove files and retry. Storage objects orphan until the cleanup
        // cron sweeps them (deferred).
        await supabase.from("messages").delete().eq("id", canonicalMessageId);
        return errorResponse("attachments_too_large", 413);
      }

      // One <attachment> block per file, through the shared resolver so the
      // seam is uniform with the agent-attachment loader. Uploads use their
      // cached text (unchanged); gdrive_link rows resolve LIVE. A Drive row that
      // can't be read becomes an unavailable block so the turn still runs. The
      // filename is user-supplied inside an XML-style attribute, so it's escaped.
      const messageBlocks: string[] = [];
      for (const row of msgAttRows) {
        const resolved = await resolveAttachmentText(
          {
            sourceType: row.source_type,
            sourceMetadata: row.source_metadata,
            originalFilename: row.original_filename,
            cachedText: row.extracted_text,
          },
          user.id,
        );
        if (resolved.kind === "text") {
          messageBlocks.push(
            `<attachment filename="${escapeAttributeValue(row.original_filename)}">\n${resolved.text}\n</attachment>`,
          );
        } else if (resolved.kind === "unavailable") {
          messageBlocks.push(
            `<attachment filename="${escapeAttributeValue(row.original_filename)}" status="unavailable">\nThis linked Drive file could not be read (it may have been moved, deleted, or access was revoked).\n</attachment>`,
          );
        }
      }
      messageAttachmentBlocks = messageBlocks.join("\n\n");
    }

    // Current user turn: attachment blocks (if any) prepended to the typed
    // message, all inside <user_input> per the prompt-defense contract —
    // attachment content is user-supplied DATA, never instructions.
    const userTurnBody = messageAttachmentBlocks
      ? `${messageAttachmentBlocks}\n\n${user_message}`
      : user_message;
    apiMessages.push({
      role: "user",
      content: wrapUserMessage(userTurnBody),
    });

    // ---- Load active attachments (deterministic order for prefix caching).
    // Include gdrive_link rows even with null extracted_text — their content is
    // fetched live at run-time; upload rows still require extracted_text, as
    // before. source_type/source_metadata drive the resolver branch.
    const { data: attRows, error: attErr } = await supabase
      .from("agent_attachments")
      .select("original_filename, extracted_text, source_type, source_metadata")
      .eq("agent_id", agent.id)
      .is("deleted_at", null)
      .or("extracted_text.not.is.null,source_type.eq.gdrive_link")
      .order("created_at", { ascending: true });
    if (attErr) {
      console.error("agent_attachments fetch failed", { code: attErr.code });
      return errorResponse("internal_error", 500);
    }

    // Resolve each attachment to text through the shared seam. Uploads use the
    // cached extracted_text (unchanged); gdrive_link rows resolve LIVE via the
    // M5 gate + Drive content client. Local (upload) and live-Drive blocks are
    // kept separate so the cache breakpoint sits AFTER the stable local prefix
    // only — a live Drive file changes between turns, so its content must never
    // be served from the prefix cache (D-067). The filename is user-supplied;
    // local upload blocks keep their existing (unescaped) form for byte-for-byte
    // regression-freedom, and the new Drive/unavailable blocks are escaped.
    const localAttachmentBlocks: string[] = [];
    const driveAttachmentBlocks: string[] = [];
    for (const att of attRows ?? []) {
      const row = att as {
        original_filename: string;
        extracted_text: string | null;
        source_type: string | null;
        source_metadata: unknown;
      };
      const isDrive = row.source_type === "gdrive_link";
      const resolved = await resolveAttachmentText(
        {
          sourceType: row.source_type,
          sourceMetadata: row.source_metadata,
          originalFilename: row.original_filename,
          cachedText: row.extracted_text,
        },
        user.id,
      );
      if (resolved.kind === "text") {
        const block = isDrive
          ? `<attachment filename="${escapeAttributeValue(row.original_filename)}">\n${resolved.text}\n</attachment>`
          : `<attachment filename="${row.original_filename}">\n${resolved.text}\n</attachment>`;
        (isDrive ? driveAttachmentBlocks : localAttachmentBlocks).push(block);
      } else if (resolved.kind === "unavailable") {
        driveAttachmentBlocks.push(
          `<attachment filename="${escapeAttributeValue(row.original_filename)}" status="unavailable">\nThis linked Drive file could not be read (it may have been moved, deleted, or access was revoked).\n</attachment>`,
        );
      }
      // kind 'omit' → no block (upload with empty/failed extraction; unchanged).
    }

    const systemBlocks: AnthropicSystemBlock[] = [
      { type: "text", text: buildSystemPrompt(systemPromptSnapshot) },
      ...localAttachmentBlocks.map(
        (text): AnthropicSystemBlock => ({ type: "text", text }),
      ),
    ];
    // Cache breakpoint on the last STABLE block (system prompt + local uploads).
    // With no Drive rows this is identical to before (cache on the last block).
    systemBlocks[systemBlocks.length - 1] = {
      ...systemBlocks[systemBlocks.length - 1],
      cache_control: { type: "ephemeral" },
    };
    // Live Drive content is appended AFTER the cache breakpoint, so it is never
    // part of the cached prefix.
    for (const text of driveAttachmentBlocks) {
      systemBlocks.push({ type: "text", text });
    }

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

    // ---- MCP agent tools (Phase 2, 2P-6b) — DOUBLE-GATED, resolved + classified
    // by the shared resolveGatedOrgMcpTools (also used by the headless runAgent
    // primitive, so the governance and read/write classification live in one
    // place). Gate A (flag MCP_AGENT_TOOLS_ENABLED): default OFF; when off this
    // returns empty WITHOUT a DB read, so the request is byte-identical to the
    // single-pass path. Gate B (has-tools): with the flag on, the loop engages
    // only when the org PERMITS the MCP category AND has a connected, healthy
    // server (a non-empty tool set, D-104). loopEngaged folds both gates.
    const gatedMcp = await resolveGatedOrgMcpTools(agent.organization_id);
    const mcpToolDefs = gatedMcp.toolDefs;
    const mcpRoutingMap = gatedMcp.routingMap;
    const mcpAccessByName = gatedMcp.accessByName;
    const mcpLoopEngaged = gatedMcp.loopEngaged;

    // ---- The native research tool (Knowledge arc Step 3) rides the SAME
    // gate as the MCP tools (flag + the org's mcp category policy + a
    // connected server — loopEngaged folds all three): it reads repositories
    // through those same governed connections, so the same lever governs it.
    // Scope visibility resolves through getVisibleCollections(), the exact
    // RLS path the Research surface uses, under THIS user's session — the
    // agent can never research a collection its human couldn't select.
    let researchTool = null as ReturnType<typeof buildResearchToolDef> | null;
    if (mcpLoopEngaged) {
      const visibleCollections = await getVisibleCollections();
      researchTool = buildResearchToolDef(
        visibleCollections.map((c) => ({
          name: c.name,
          documentCount: c.presentCount,
        })),
      );
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

    // ---- Stream the assistant turn (fresh send). The streaming machinery
    // (consumeStream, the agentic loop, citation draining, persistence, and the
    // 2P-7b write-confirmation pause) lives in lib/chat/assistant-stream.ts so a
    // paused write's resume (/api/chat/confirm) shares the exact same path.
    return streamChatTurn({
      supabase,
      conversationId,
      organizationId: agent.organization_id,
      agentId: agent.id,
      userId: user.id,
      modelSnapshot,
      vendor,
      vendorModelName,
      systemBlocks,
      tools,
      mcpToolDefs,
      mcpRoutingMap,
      mcpAccessByName,
      mcpLoopEngaged,
      researchTool,
      mode: {
        kind: "fresh",
        userMessageId: userMsg.id,
        baseMessages: apiMessages,
      },
    });
  } catch (err) {
    console.error("/api/chat unexpected error", err);
    return errorResponse("internal_error", 500);
  }
}
