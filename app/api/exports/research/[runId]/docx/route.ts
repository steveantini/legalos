import "server-only";

import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { getCurrentUserProfile } from "@/lib/auth/access";
import { renderMessageAsDocx } from "@/lib/exports/docx";
import { getResearchRunDetail } from "@/lib/knowledge/research/data";
import { composeResearchExportMarkdown } from "@/lib/knowledge/research/export-markdown";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Word (.docx) export for a research run (Knowledge arc).
 *
 * GET /api/exports/research/[runId]/docx
 *
 * REUSES the message-export pipeline end to end: the run's record (question,
 * scope + provenance, answer, basis, the verify-against-sources line,
 * citations, and the per-document findings — the memo's evidence) is
 * composed as markdown (export-markdown.ts, pure and tested) and rendered by
 * the SAME renderMessageAsDocx the chat export uses, delivered with
 * Content-Disposition: attachment, with an audit row in formatted_outputs
 * carrying research_run_id (0072; nothing persisted, storage_path null —
 * exactly the message-export posture).
 *
 * Authorization is RLS-driven: getResearchRunDetail reads under the 0071
 * policies (the asker, plus org/super admins reading the organization's
 * work), so a non-visible run collapses to 404. Terminal runs export —
 * completed fully, cancelled/failed with their status stated plainly in the
 * document; a run still in progress is declined honestly.
 */

export const runtime = "nodejs";
// docx generation is fast and bounded (the message route's value).
export const maxDuration = 60;

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ExportErrorCode =
  | "unauthenticated"
  | "not_found"
  | "not_exportable"
  | "internal_error";

function errorResponse(error: ExportErrorCode, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function formatYYYYMMDDUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await context.params;
    if (!/^[0-9a-f-]{36}$/.test(runId)) return errorResponse("not_found", 404);

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return errorResponse("unauthenticated", 401);

    const detail = await getResearchRunDetail(runId);
    if (!detail) return errorResponse("not_found", 404);
    const { run, findings } = detail;

    // Only a settled run exports; in-progress states decline honestly (the
    // UI disables the affordance for them too — this is the server gate).
    if (
      run.status === "planning" ||
      run.status === "running" ||
      run.status === "synthesizing"
    ) {
      return errorResponse("not_exportable", 409);
    }

    const { markdown, filenameBase } = composeResearchExportMarkdown(
      run,
      findings,
    );

    const exportedAt = new Date();
    let buffer: Buffer;
    try {
      buffer = await renderMessageAsDocx({
        markdown,
        agentName: "Research",
        // Citations render as the memo's numbered Sources list (the answer's
        // citations are code-built with no in-body markers, so the
        // footnote machinery doesn't apply); no sources passed here.
        sources: [],
        exportedAt,
        productName: siteConfig.siteTitle,
      });
    } catch (err) {
      console.error("research export render failed", err);
      return errorResponse("internal_error", 500);
    }

    // Audit row (formatted_outputs, 0072: research-anchored). Non-fatal —
    // the user gets the file regardless, matching the message route.
    const profile = await getCurrentUserProfile();
    if (profile?.organization_id) {
      const { error: insertErr } = await supabase
        .from("formatted_outputs")
        .insert({
          research_run_id: run.id,
          user_id: user.id,
          organization_id: profile.organization_id,
          format: "docx",
          storage_path: null,
          size_bytes: buffer.length,
        });
      if (insertErr) {
        console.error("formatted_outputs insert failed", {
          code: insertErr.code,
        });
      }
    }

    const filename = `${filenameBase} - ${formatYYYYMMDDUtc(exportedAt)}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": DOCX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    console.error("research export failed", err);
    return errorResponse("internal_error", 500);
  }
}
