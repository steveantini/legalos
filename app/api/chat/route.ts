import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_BYTES } from "@/lib/actions/_attachment-shared";
import { resolveOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import { resolveAttachmentText } from "@/lib/connections/attachment-content";
import type { ModelCredential } from "@/lib/connections/providers/types";
import { executeMcpTool } from "@/lib/connections/mcp/execute-tool";
import {
  classifyMcpTool,
  type McpToolAccess,
} from "@/lib/connections/mcp/tool-classification";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import { ALLOWED_MIME_TYPES, extractText } from "@/lib/extract/extract";
import {
  streamAnthropicChat,
  type AnthropicChatMessage,
  type AnthropicCustomTool,
  type AnthropicSystemBlock,
  type AnthropicStreamEvent,
  type AnthropicTool,
  type AnthropicToolResultBlock,
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
import { resolveModelCredential } from "@/lib/llm/model-credential";
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

// Aggregate cap on extracted attachment text across all of a message's
// attachments (D-055), enforced at send. Per-file extraction already truncates
// at 100k chars; this bounds the sum so several large files can't blow up the
// prompt and its cost.
const ATTACHMENT_AGGREGATE_CHAR_BUDGET = 250_000;

// ---- MCP agentic tool-use loop (Phase 2, 2P-6b) guards ----
// At most this many model turns per user turn. The final allowed turn runs
// WITHOUT tools so the model produces a text answer rather than another tool
// request, bounding cost and runaway tool chains.
const MCP_MAX_TOOL_ROUNDS = 8;
// Stop initiating new tool rounds past this wall-clock budget (inside the route's
// 300s maxDuration), then force the final no-tools turn.
const MCP_LOOP_WALL_CLOCK_MS = 240_000;
// The v1 write-policy result fed back to the model when it requests a write tool.
const MCP_WRITE_BLOCKED_MESSAGE =
  "This action needs confirmation and is not yet enabled, so nothing was sent, created, or deleted. Tell the user what you would do and that it requires confirmation.";

/**
 * A token/PII-free summary of an MCP tool call's arguments for the trace record:
 * the sorted argument KEY names only, never the values (which may carry PII). The
 * model still receives the full arguments for execution; only the persisted /
 * surfaced trace uses this summary.
 */
function mcpArgsSummary(input: unknown): { args: string[] } {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { args: Object.keys(input as Record<string, unknown>).sort() };
  }
  return { args: [] };
}

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

    // ---- MCP agent tools (Phase 2, 2P-6b) — DOUBLE-GATED.
    //   GATE A (feature flag): MCP_AGENT_TOOLS_ENABLED must be exactly "true".
    //     Default OFF — when off, the loop NEVER engages and we don't even resolve
    //     MCP tools, so every request is byte-identical to the single-pass path
    //     (no extra DB read). The operator flips this to kill/enable the loop with
    //     no deploy.
    //   GATE B (has-tools): even with the flag on, the loop engages only when the
    //     org PERMITS the MCP category AND has a connected, healthy server
    //     (resolveOrgMcpTools returns a non-empty tool set, D-104). Otherwise the
    //     request takes the byte-identical single-pass path.
    // The loop engages IFF (flag on) AND (non-empty MCP tools). Every other request
    // is unchanged from before 2P-6b.
    const mcpToolsFlag = process.env.MCP_AGENT_TOOLS_ENABLED === "true";
    let mcpToolDefs: AnthropicCustomTool[] = [];
    let mcpRoutingMap: Record<string, McpToolRoute> = {};
    const mcpAccessByName = new Map<string, McpToolAccess>();
    if (mcpToolsFlag) {
      const resolved = await resolveOrgMcpTools();
      mcpToolDefs = resolved.toolDefs;
      mcpRoutingMap = resolved.routingMap;
      // Classify each offered tool (read vs write) for the loop's v1 policy. A
      // descriptor not found (shouldn't happen) classifies as write (conservative).
      const targetsByServerId = new Map(
        resolved.targets.map((t) => [t.serverId, t]),
      );
      for (const [namespaced, route] of Object.entries(resolved.routingMap)) {
        const descriptor = targetsByServerId
          .get(route.serverId)
          ?.tools?.find((tool) => tool.name === route.originalToolName);
        mcpAccessByName.set(
          namespaced,
          descriptor ? classifyMcpTool(descriptor) : "write",
        );
      }
    }
    const mcpLoopEngaged = mcpToolsFlag && mcpToolDefs.length > 0;

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
        let mcpToolCallCount = 0;
        let streamError: Error | null = null;

        // Consume ONE model stream into the shared accumulators + SSE. Called once
        // by the single-pass path and once per round by the MCP loop; the event
        // handling below is verbatim from the pre-2P-6b single-pass consumption.
        async function consumeStream(
          events: AsyncIterable<AnthropicStreamEvent>,
        ): Promise<void> {
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
        }

        // Accumulate one round's usage into the per-turn totals (the loop sums
        // across rounds; the single-pass path sets them once).
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

        // Finalize a held/failed MCP tool call (no execution) into an is_error
        // tool_result + an error trace. Used for write-blocked and unknown-tool.
        function holdMcpToolCall(
          toolCall: ChatToolCall,
          errorCode: string,
          message: string,
        ): AnthropicToolResultBlock {
          const finishedAt = new Date().toISOString();
          toolCall.status = "error";
          toolCall.finished_at = finishedAt;
          toolCall.error = errorCode;
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

        // Execute one MCP tool_use block into a tool_result to feed back, recording
        // the trace (server, tool, args summary, status, timing, read/write) and
        // surfacing tool_trace_* SSE events. v1 policy: run reads, HOLD writes.
        async function runOneMcpToolCall(block: {
          id: string;
          name: string;
          input: unknown;
        }): Promise<AnthropicToolResultBlock> {
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

          // Unknown tool (the model can only call offered tools — guard anyway).
          if (!route) {
            return holdMcpToolCall(
              toolCall,
              "unknown_tool",
              "The tool call failed: the requested tool is not available.",
            );
          }
          // WRITE policy (v1): hold — never silently send/create/delete.
          if (access === "write") {
            return holdMcpToolCall(
              toolCall,
              "write_blocked",
              MCP_WRITE_BLOCKED_MESSAGE,
            );
          }
          // READ: execute (never throws; returns a tool_result + safe trace).
          const exec = await executeMcpTool({
            route,
            toolInput: block.input,
            toolUseId: block.id,
          });
          const ok = exec.trace.status === "ok";
          toolCall.status = ok ? "done" : "error";
          toolCall.finished_at = exec.trace.finishedAt;
          toolCall.output = { source_ids: [] };
          if (!ok) toolCall.error = exec.trace.errorCode;
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
          return exec.toolResult;
        }

        // The gated agentic loop: stream the model, and while it requests client
        // tools, execute them and re-stream with the results appended — until a
        // normal end, or the round / wall-clock budget forces a final no-tools turn.
        async function runMcpLoop(credential: ModelCredential): Promise<void> {
          const allTools: AnthropicTool[] = [...tools, ...mcpToolDefs];
          // Ephemeral model context: starts from the string-based history + current
          // turn, then gains content-block tool turns. The PERSISTED history stays
          // the final assistant text + tool_calls JSONB, so replay is unaffected.
          const loopMessages: AnthropicChatMessage[] = [...apiMessages];
          const deadline = Date.now() + MCP_LOOP_WALL_CLOCK_MS;
          let round = 0;

          for (;;) {
            round += 1;
            const budgetExhausted =
              round >= MCP_MAX_TOOL_ROUNDS || Date.now() >= deadline;
            // The final allowed turn runs WITHOUT tools to force a text answer.
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

            // The model requested client tools. Re-send its turn (text + tool_use
            // blocks), then a user turn with the tool_results.
            drainCitations();
            loopMessages.push({
              role: "assistant",
              content: finalMessage.content as AnthropicChatMessage["content"],
            });
            const toolResults: AnthropicToolResultBlock[] = [];
            for (const block of finalMessage.content) {
              if (block.type !== "tool_use") continue;
              toolResults.push(
                await runOneMcpToolCall({
                  id: block.id,
                  name: block.name,
                  input: block.input,
                }),
              );
            }
            loopMessages.push({
              role: "user",
              content: toolResults as AnthropicChatMessage["content"],
            });
          }
        }

        try {
          // Non-anthropic vendors are unsupported (parity with the prior dispatch).
          if (vendor !== "anthropic") {
            throw new Error(`Unsupported model vendor: ${vendor}`);
          }
          // Resolve the credential through the single seam (D-086); managed mode
          // returns the platform key so the stream is identical to before, BYO
          // rides the same call. Resolving inside try surfaces a failure as a
          // stream error, exactly as before.
          const credential = await resolveModelCredential({
            organizationId: agent.organization_id,
            userId: user.id,
            vendor,
          });

          if (mcpLoopEngaged) {
            await runMcpLoop(credential);
          } else {
            // Single-pass — byte-identical to the pre-2P-6b path.
            const r = streamAnthropicChat({
              model: vendorModelName,
              credential,
              systemBlocks,
              messages: apiMessages,
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

        // Bump conversations.updated_at to reflect genuine last activity.
        // The chat flow otherwise never updates the conversation row, so
        // updated_at would stay frozen at creation time and the home's
        // "Continue working" ordering would be wrong. One write per
        // request (both turns are now persisted). Best-effort: a failure
        // here must not abort a stream that already produced a reply.
        const { error: bumpErr } = await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
        if (bumpErr) {
          console.error("conversation updated_at bump failed", {
            code: bumpErr.code,
          });
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

        // The usage row, summed across all loop rounds (one row per user turn).
        const usageRow = {
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
        };
        // Include mcp_tool_call_count; tolerate the column being absent pre-
        // migration (Postgres 42703) by retrying without it, so the usage row is
        // still recorded (the count is lost until the migration is applied).
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
