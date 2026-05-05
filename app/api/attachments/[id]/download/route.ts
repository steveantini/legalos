import "server-only";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Signed-URL redirect for a single agent attachment.
 *
 * GET /api/attachments/[id]/download
 *
 * Used by the chat surface's empty-state file list (Session 19, spec §2.8)
 * to let the user re-download files they've attached to the agent. Mirrors
 * the ownership-validation shape of the docx-export route at
 * `app/api/exports/messages/[id]/docx/route.ts`:
 *
 *   - Auth check first (no session → 404, no leakage).
 *   - RLS-scoped SELECT on agent_attachments via
 *     agent_attachments_user_owns from migration 0007.
 *   - Belt-and-suspenders re-check that the parent agent's `created_by`
 *     matches the caller. Soft-deleted attachments (deleted_at IS NOT
 *     NULL) collapse to 404 the same way missing rows do.
 *   - All failure modes return 404 — same surface for missing,
 *     forbidden, RLS-hidden, soft-deleted, and signing failures, so the
 *     route never leaks which condition tripped.
 *
 * The route does NOT proxy bytes through the function. It signs a URL
 * against the storage bucket (60s TTL) and returns a 302 redirect. Signed
 * URLs are the right tool — Vercel's edge handles the actual download
 * directly from Supabase Storage with no Function bandwidth tax, and the
 * route stays thin (~one signing call). The 60s TTL is well within
 * "user clicked the link" timing; longer windows would invite link-share
 * leaks if a user pasted the redirect URL elsewhere.
 *
 * The storage bucket `agent-attachments` is private (migration 0008);
 * createSignedUrl is the only legitimate read path.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "agent-attachments";
const SIGN_TTL_SECONDS = 60;

function notFound() {
  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: attachmentId } = await context.params;

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return notFound();

    // ---- Load the attachment row. RLS via agent_attachments_user_owns
    //      collapses cross-user / cross-org access to a null result.
    //      The explicit user_id check below is belt-and-suspenders
    //      against future RLS configuration drift.
    const { data: attachment, error: attErr } = await supabase
      .from("agent_attachments")
      .select(
        "id, agent_id, user_id, storage_path, original_filename, deleted_at",
      )
      .eq("id", attachmentId)
      .maybeSingle();
    if (attErr) {
      console.error("agent_attachments fetch failed", { code: attErr.code });
      return notFound();
    }
    if (!attachment) return notFound();
    if (attachment.user_id !== user.id) return notFound();
    if (attachment.deleted_at !== null) return notFound();

    // ---- Verify the caller still owns the parent agent. Mirrors the
    //      docx-export route's parent-conversation ownership re-check
    //      (the analogous "owner of the resource that owns this row").
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("created_by")
      .eq("id", attachment.agent_id)
      .maybeSingle();
    if (agentErr || !agent) {
      console.error("agents fetch failed", { code: agentErr?.code });
      return notFound();
    }
    if (agent.created_by !== user.id) return notFound();

    // ---- Sign the storage object. 60s window is enough for the
    //      browser to follow the 302 and start the download.
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, SIGN_TTL_SECONDS, {
        download: attachment.original_filename,
      });
    if (signErr || !signed?.signedUrl) {
      console.error("createSignedUrl failed", {
        code: signErr?.message,
      });
      return notFound();
    }

    return NextResponse.redirect(signed.signedUrl, 302);
  } catch (err) {
    console.error("/api/attachments/[id]/download unexpected error", err);
    return notFound();
  }
}
