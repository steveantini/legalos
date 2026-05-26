import "server-only";

import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import type { ChatSource } from "@/lib/chat/sse-parser";
import { renderMessageAsDocx } from "@/lib/exports/docx";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Word (.docx) export for a single assistant message.
 *
 * GET /api/exports/messages/[id]/docx
 *
 * Renders the message's markdown content into a Word document via the
 * docx package, inserts a row in formatted_outputs for audit, and
 * returns the file with Content-Disposition: attachment so the browser
 * triggers a download. Per architecture §4 / Session 8k.
 *
 * Authorization is RLS-driven: the SELECT on messages goes through
 * messages_user_via_conversation (0004) which scopes to the user's own
 * conversations. A non-owner request collapses to 404 — the same
 * "missing or forbidden" surface used by the chat surface and edit
 * page, so the route never leaks which messages belong to other users.
 *
 * formatted_outputs.storage_path stays null in v1: files are
 * generated on demand, not persisted (architecture §4). The audit
 * row exists so future export-history work has a starting point.
 */

export const runtime = "nodejs";
// docx generation is fast (~500ms typical) but bounded; well under the
// 300s default per Vercel's April-2026 platform notes.
export const maxDuration = 60;

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ExportErrorCode =
  | "unauthenticated"
  | "not_found"
  | "invalid_message"
  | "internal_error";

function errorResponse(error: ExportErrorCode, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Make an agent name safe to drop into a Content-Disposition filename across
 * Windows, macOS, and Linux: strip the reserved characters and control codes,
 * collapse whitespace, and fall back to a generic label if nothing usable
 * remains.
 */
function sanitizeFilenamePart(input: string): string {
  const cleaned = input.replace(/[\\/:*?"<>|\x00-\x1f]/g, " ");
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : "Agent response";
}

/**
 * Filename date stamp: YYYY-MM-DD in UTC. Takes the same `exportedAt` instant
 * the renderer stamps into the document subtitle and footer, so the filename
 * date and the in-document date never disagree.
 */
function formatYYYYMMDDUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: messageId } = await context.params;

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return errorResponse("unauthenticated", 401);

    // ---- Load the message. RLS via messages_user_via_conversation
    //      collapses cross-user access to a null result, which we map to
    //      404 — generic "not_found" so we don't leak which condition
    //      tripped (missing message vs. another user's message).
    const { data: message, error: msgErr } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, sources")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr) {
      console.error("messages fetch failed", { code: msgErr.code });
      return errorResponse("internal_error", 500);
    }
    if (!message) return errorResponse("not_found", 404);
    if (message.role !== "assistant") {
      return errorResponse("invalid_message", 400);
    }

    // ---- Load the parent conversation for organization + agent.
    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("id, agent_id, organization_id, user_id")
      .eq("id", message.conversation_id)
      .maybeSingle();
    if (convErr) {
      console.error("conversation fetch failed", { code: convErr.code });
      return errorResponse("internal_error", 500);
    }
    if (!conversation || conversation.user_id !== user.id) {
      // Belt-and-suspenders: RLS would already filter this; the explicit
      // check ensures a clean 404 path even if RLS configuration drifts.
      return errorResponse("not_found", 404);
    }

    // ---- Load the agent for the title block + filename.
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("slug, name")
      .eq("id", conversation.agent_id)
      .maybeSingle();
    if (agentErr || !agent) {
      console.error("agent fetch failed", { code: agentErr?.code });
      return errorResponse("internal_error", 500);
    }

    // ---- Render markdown → docx. The same `exportedAt` instant feeds the
    //      document's date subtitle, the page footer, and the filename below.
    const exportedAt = new Date();
    let buffer: Buffer;
    try {
      buffer = await renderMessageAsDocx({
        markdown: message.content,
        agentName: agent.name ?? "Untitled agent",
        sources: (message.sources ?? []) as ChatSource[],
        exportedAt,
        productName: siteConfig.siteTitle,
      });
    } catch (err) {
      console.error("renderMessageAsDocx failed", err);
      return errorResponse("internal_error", 500);
    }

    // ---- Audit row. Errors here are non-fatal — the user gets the
    //      file regardless; the ledger may be reconciled later.
    const { error: insertErr } = await supabase
      .from("formatted_outputs")
      .insert({
        conversation_id: conversation.id,
        message_id: message.id,
        user_id: user.id,
        organization_id: conversation.organization_id,
        format: "docx",
        storage_path: null,
        size_bytes: buffer.length,
      });
    if (insertErr) {
      console.error("formatted_outputs insert failed", {
        code: insertErr.code,
      });
    }

    // ---- Filename: "<Agent name> - <YYYY-MM-DD>.docx" (UTC date — minor
    //      cosmetic timezone drift acceptable in v1). The agent name is
    //      sanitized for cross-platform filesystem safety; slug is the
    //      fallback if the name is somehow empty.
    const agentNamePart = sanitizeFilenamePart(
      agent.name ?? agent.slug ?? "Agent response",
    );
    const filename = `${agentNamePart} - ${formatYYYYMMDDUtc(exportedAt)}.docx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": DOCX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("/api/exports/messages/[id]/docx unexpected error", err);
    return errorResponse("internal_error", 500);
  }
}
