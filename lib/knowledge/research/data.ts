import "server-only";

import type {
  ResearchCitation,
  ResearchFindingView,
  ResearchRunStatus,
  ResearchRunView,
} from "@/lib/knowledge/research/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side reads for the Research surface (Knowledge arc Step 2). All
 * through the RLS-scoped client, so visibility is the database's answer: a
 * user sees their own runs; org and super admins see the organization's
 * (the work-product-belongs-to-the-org stance, enforced by 0071's policies).
 */

type RunRow = {
  id: string;
  user_id: string;
  question: string;
  status: ResearchRunStatus;
  scope: { id: string; name: string; provenance: string[] }[];
  documents_total: number;
  documents_processed: number;
  documents_failed: number;
  skipped_unsupported: number;
  answer: string | null;
  citations: ResearchCitation[] | null;
  basis: string | null;
  failure_reason: string | null;
  created_at: string;
};

const RUN_COLUMNS =
  "id, user_id, question, status, scope, documents_total, documents_processed, documents_failed, skipped_unsupported, answer, citations, basis, failure_reason, created_at";

function toRunView(row: RunRow): ResearchRunView {
  return {
    id: row.id,
    ownerUserId: row.user_id,
    question: row.question,
    status: row.status,
    scope: row.scope ?? [],
    documentsTotal: row.documents_total,
    documentsProcessed: row.documents_processed,
    documentsFailed: row.documents_failed,
    skippedUnsupported: row.skipped_unsupported,
    answer: row.answer,
    citations: row.citations ?? [],
    basis: row.basis,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

/** The viewer's visible runs, newest first (the history list). */
export async function listResearchRuns(limit = 30): Promise<ResearchRunView[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("research_runs")
    .select(RUN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as RunRow[]).map(toRunView);
}

/** One run with its findings, or null when not visible to the viewer. */
export async function getResearchRunDetail(runId: string): Promise<{
  run: ResearchRunView;
  findings: ResearchFindingView[];
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data: runRow, error: runError } = await supabase
    .from("research_runs")
    .select(RUN_COLUMNS)
    .eq("id", runId)
    .maybeSingle();
  if (runError || !runRow) return null;

  const { data: findingRows, error: findingsError } = await supabase
    .from("research_run_findings")
    .select(
      "external_id, title, source_url, provenance, relevant, determination, supporting_excerpt, status",
    )
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (findingsError) return { run: toRunView(runRow as unknown as RunRow), findings: [] };

  const findings = ((findingRows ?? []) as {
    external_id: string;
    title: string;
    source_url: string | null;
    provenance: string;
    relevant: boolean | null;
    determination: string;
    supporting_excerpt: string;
    status: "ok" | "fetch_failed" | "read_incomplete";
  }[]).map((row) => ({
    externalId: row.external_id,
    title: row.title,
    sourceUrl: row.source_url,
    provenance: row.provenance,
    relevant: row.relevant,
    determination: row.determination,
    supportingExcerpt: row.supporting_excerpt,
    status: row.status,
  }));

  return { run: toRunView(runRow as unknown as RunRow), findings };
}
