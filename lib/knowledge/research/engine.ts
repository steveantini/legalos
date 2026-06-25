import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { getOrganizationDefaultModel } from "@/lib/auth/access";
import {
  listRemoteFolderChildren,
  readRemoteDocument,
  type EnumerationTarget,
} from "@/lib/knowledge/enumeration";
import { resolveEnumerationTarget } from "@/lib/knowledge/targets";
import { runSyncSegment, type SyncSource } from "@/lib/knowledge/sync";
import { buildCitations, composeBasisLine } from "@/lib/knowledge/research/basis";
import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  buildPlanPrompt,
  buildSynthesisPrompt,
  parseClassifierOutput,
  type ClassifyDocument,
} from "@/lib/knowledge/research/classify";
import {
  processResearchSegment,
  type SegmentFinding,
} from "@/lib/knowledge/research/engine-core";
import {
  docCapExceededMessage,
  isReadableMimeType,
  RESEARCH_ENUMERATION_MESSAGE,
  RESEARCH_SEGMENT_DOCS,
  type ResearchCitation,
  type ResearchDocumentRef,
  type ResearchFindingView,
} from "@/lib/knowledge/research/shared";
import {
  streamAnthropicChat,
  type AnthropicSystemBlock,
} from "@/lib/llm/anthropic/chat";
import { resolveModelCredential } from "@/lib/llm/model-credential";
import type { ModelCredential } from "@/lib/connections/providers/types";
import { DEFAULT_MODEL_FALLBACK } from "@/lib/llm/models";
import { parseModelId } from "@/lib/llm/parse-model-id";
import { computeCostMicroUsd } from "@/lib/llm/pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The research engine (Knowledge arc Step 2): a DETERMINISTIC SEGMENTED
 * SWEEP, deliberately NOT the chat agentic loop (runAgent's round and
 * wall-clock guards are sized for conversation, not a corpus). Code owns the
 * orchestration — enumerate live, fetch each document where it lives,
 * classify in fixed-contract batches, synthesize once at the end — and each
 * `advanceResearchRun` invocation performs ONE bounded unit of work (the
 * segmented-continuation house pattern: mcp_paused_runs / runWorkflowSegment
 * in spirit, the collection sync's client-driven loop in practice):
 *
 *   planning      → enumerate the scope live (REUSING the Step-1 sync walk
 *                   with collecting deps), apply the caps honestly, one
 *                   cheap planning call for the rubric → running
 *   running       → one segment (~12 documents): read via the adapters with
 *                   the RESEARCH read budget (never executeMcpTool's chat
 *                   cap), classify in batches, upsert findings idempotently
 *                   (run_id + external_id), advance the cursor → repeat
 *   synthesizing  → one synthesis call over the findings; citations built in
 *                   code in the sources idiom; the honest basis line →
 *                   completed
 *
 * Every model call writes usage_events with research_run_id (agent_id null —
 * the 0071 attribution), so research spend lands in the platform Cost
 * analytics automatically; the run row carries the rollup. Cancellation is
 * checked at every entry: a cancelled run stops cleanly with its partial
 * findings intact.
 *
 * DB access is the RLS-scoped client as the asking user (owner-write
 * policies); only the usage ledger uses the service-role client (the
 * established run-agent divergence).
 */

/** What one advance invocation reports back to the client loop. */
export type AdvanceResult = {
  status:
    | "planning"
    | "running"
    | "synthesizing"
    | "completed"
    | "failed"
    | "cancelled";
  documentsTotal: number;
  documentsProcessed: number;
  documentsFailed: number;
  skippedUnsupported: number;
  /** Findings produced by THIS invocation (the client accumulates). */
  newFindings: ResearchFindingView[];
  answer: string | null;
  citations: ResearchCitation[];
  basis: string | null;
  failureReason: string | null;
};

/** Enumeration listing calls allowed in the planning step (~4,000 docs). */
const ENUMERATION_CALL_BUDGET = 40;
/** Output budgets per call kind. */
const PLAN_MAX_TOKENS = 1_000;
const CLASSIFY_MAX_TOKENS = 4_000;
const SYNTHESIS_MAX_TOKENS = 3_000;

type RunRow = {
  id: string;
  organization_id: string;
  user_id: string;
  question: string;
  scope: { id: string; name: string; provenance: string[] }[];
  documents_snapshot: ResearchDocumentRef[];
  status: string;
  documents_total: number;
  documents_processed: number;
  documents_failed: number;
  skipped_unsupported: number;
  rubric: string | null;
  cursor: { nextIndex: number } | null;
  answer: string | null;
  citations: ResearchCitation[];
  basis: string | null;
  failure_reason: string | null;
};

type ModelContext = {
  organizationId: string;
  userId: string;
  runId: string;
  /** Full canonical id (vendor/model), for pricing and the ledger. */
  modelId: string;
  /** Bare model id for the SDK call. */
  bareModel: string;
  credential: ModelCredential;
};

// ---------------------------------------------------------------------------
// Model call + ledger
// ---------------------------------------------------------------------------

async function resolveModelContext(
  run: Pick<RunRow, "id" | "organization_id" | "user_id">,
): Promise<ModelContext> {
  const modelId = (await getOrganizationDefaultModel()) ?? DEFAULT_MODEL_FALLBACK;
  const { vendor, model } = parseModelId(modelId);
  const credential = await resolveModelCredential({
    organizationId: run.organization_id,
    userId: run.user_id,
    vendor,
  });
  return {
    organizationId: run.organization_id,
    userId: run.user_id,
    runId: run.id,
    modelId,
    bareModel: model,
    credential,
  };
}

/**
 * One non-streaming model call: drive the SDK stream to completion via
 * finalMessage()/finalUsage() (the headless run-agent idiom), record the
 * usage ledger row with the research attribution, and return the text.
 */
async function researchModelCall(
  ctx: ModelContext,
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ text: string; tokensIn: number; tokensOut: number; costMicroUsd: number }> {
  const systemBlocks: AnthropicSystemBlock[] = [{ type: "text", text: system }];
  const r = streamAnthropicChat({
    model: ctx.bareModel,
    credential: ctx.credential,
    systemBlocks,
    messages: [{ role: "user", content: user }],
    maxTokens,
  });
  const final = await r.finalMessage();
  const usage = await r.finalUsage();

  const text = (final.content as Anthropic.Messages.ContentBlock[])
    .filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === "text",
    )
    .map((block) => block.text)
    .join("");

  let costMicroUsd = 0;
  try {
    costMicroUsd = computeCostMicroUsd(
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_creation_input_tokens,
      usage.cache_read_input_tokens,
      0,
      ctx.modelId,
    );
  } catch (err) {
    console.error("research cost computation failed — recording 0", err);
  }

  // The ledger row: agent_id deliberately omitted (research has no agent;
  // nullable per 0071), research_run_id carries the attribution that platform
  // Cost analytics absorb automatically. Service-role insert, the run-agent
  // divergence; failure logs and never fails the run.
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("usage_events").insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      research_run_id: ctx.runId,
      model: ctx.modelId,
      tokens_in: usage.input_tokens,
      tokens_out: usage.output_tokens,
      cache_creation_tokens: usage.cache_creation_input_tokens,
      cache_read_tokens: usage.cache_read_input_tokens,
      web_search_count: 0,
      cost_micro_usd: costMicroUsd,
    });
    if (error) {
      console.error("research usage_events insert failed", { code: error.code });
    }
  } catch (err) {
    console.error("research usage_events insert threw", err);
  }

  return {
    text,
    tokensIn: usage.input_tokens,
    tokensOut: usage.output_tokens,
    costMicroUsd,
  };
}

// ---------------------------------------------------------------------------
// Run helpers
// ---------------------------------------------------------------------------

function toFindingView(finding: SegmentFinding): ResearchFindingView {
  return finding;
}

function emptyResult(run: RunRow): AdvanceResult {
  return {
    status: run.status as AdvanceResult["status"],
    documentsTotal: run.documents_total,
    documentsProcessed: run.documents_processed,
    documentsFailed: run.documents_failed,
    skippedUnsupported: run.skipped_unsupported,
    newFindings: [],
    answer: run.answer,
    citations: run.citations ?? [],
    basis: run.basis,
    failureReason: run.failure_reason,
  };
}

async function loadRun(runId: string): Promise<RunRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("research_runs")
    .select(
      "id, organization_id, user_id, question, scope, documents_snapshot, status, documents_total, documents_processed, documents_failed, skipped_unsupported, rubric, cursor, answer, citations, basis, failure_reason",
    )
    .eq("id", runId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as RunRow;
}

async function failRun(runId: string, reason: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("research_runs")
    .update({ status: "failed", failure_reason: reason })
    .eq("id", runId)
    .in("status", ["planning", "running", "synthesizing"]);
}

/** Resolve live targets for a set of connections; null if ANY is unusable
 * (the run fails honestly rather than sweeping a partial scope). */
async function resolveTargets(
  connectionIds: string[],
): Promise<Map<string, EnumerationTarget> | null> {
  const targets = new Map<string, EnumerationTarget>();
  for (const connectionId of connectionIds) {
    const target = await resolveEnumerationTarget(connectionId);
    if (!target) return null;
    targets.set(connectionId, target);
  }
  return targets;
}

// ---------------------------------------------------------------------------
// The phases
// ---------------------------------------------------------------------------

async function advancePlanning(run: RunRow): Promise<AdvanceResult> {
  const supabase = await createSupabaseServerClient();

  // The selected collections' sources (RLS: visible-collection sources only).
  const collectionIds = run.scope.map((c) => c.id);
  const { data: sourceRows, error: sourcesError } = await supabase
    .from("collection_sources")
    .select("id, collection_id, connection_id, root_reference, display_path, recursive")
    .in("collection_id", collectionIds)
    .order("created_at", { ascending: true });
  if (sourcesError || !sourceRows || sourceRows.length === 0) {
    await failRun(run.id, "The selected collections have no readable sources.");
    return { ...emptyResult(run), status: "failed", failureReason: "The selected collections have no readable sources." };
  }

  const rows = sourceRows as {
    id: string;
    collection_id: string;
    connection_id: string;
    root_reference: string;
    display_path: string;
    recursive: boolean;
  }[];

  const targets = await resolveTargets([...new Set(rows.map((r) => r.connection_id))]);
  if (!targets) {
    const reason =
      "A source in the selected collections can't be read right now. Check its connection in Policy & access, or remove the source.";
    await failRun(run.id, reason);
    return { ...emptyResult(run), status: "failed", failureReason: reason };
  }

  // Live enumeration, REUSING the sync walk with collecting deps: the same
  // pagination/recursion machinery, but documents land in memory, not the
  // inventory (research never answers from a stale index).
  const collectionNameById = new Map(run.scope.map((c) => [c.id, c.name]));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const collected: ResearchDocumentRef[] = [];
  const syncSources: SyncSource[] = rows.map((r) => ({
    id: r.id,
    rootReference: r.root_reference,
    recursive: r.recursive,
  }));

  const enumeration = await runSyncSegment(
    syncSources,
    null,
    {
      listChildren: (source, folderId, pageToken) =>
        listRemoteFolderChildren(
          targets.get(rowById.get(source.id)!.connection_id)!,
          folderId,
          pageToken,
        ),
      upsertDocuments: async (source, entries) => {
        const row = rowById.get(source.id)!;
        const collectionName =
          collectionNameById.get(row.collection_id) ?? "Collection";
        for (const entry of entries) {
          collected.push({
            externalId: entry.id,
            title: entry.name,
            mimeType: entry.mimeType ?? "",
            sourceUrl: entry.url,
            connectionId: row.connection_id,
            serverId: targets.get(row.connection_id)!.serverId,
            provenance: `${collectionName} · ${row.display_path}`,
          });
        }
      },
      finalizeSource: async () => {},
      nowIso: () => new Date().toISOString(),
    },
    ENUMERATION_CALL_BUDGET,
  );

  if (!enumeration.completed) {
    // The ENUMERATION-BUDGET decline: a fixed technical limit, distinct from
    // the admin document cap below. The surface attaches the matching "why".
    const reason = RESEARCH_ENUMERATION_MESSAGE;
    await failRun(run.id, reason);
    return { ...emptyResult(run), status: "failed", failureReason: reason };
  }

  // Dedupe (a document reachable through two sources reads once), then the
  // honest type filter and the cap — both reported, never silent.
  const seen = new Set<string>();
  const deduped = collected.filter((doc) => {
    if (seen.has(doc.externalId)) return false;
    seen.add(doc.externalId);
    return true;
  });
  const readable = deduped.filter((doc) => isReadableMimeType(doc.mimeType));
  const skippedUnsupported = deduped.length - readable.length;

  const cap = await getResearchDocumentCap();
  if (readable.length > cap) {
    // The DOCUMENT-CAP decline (admin-adjustable): the exact live count is
    // known here, so the message states it.
    const reason = docCapExceededMessage(readable.length, cap);
    await failRun(run.id, reason);
    return { ...emptyResult(run), status: "failed", failureReason: reason };
  }
  if (readable.length === 0) {
    const reason =
      skippedUnsupported > 0
        ? "The selected collections contain no documents of readable types."
        : "The selected collections contain no documents. Sync the collections, or pick different ones.";
    await failRun(run.id, reason);
    return { ...emptyResult(run), status: "failed", failureReason: reason };
  }

  // The one cheap planning call: the classification rubric.
  const ctx = await resolveModelContext(run);
  const plan = await researchModelCall(
    ctx,
    "You design rigorous document-review rubrics for legal teams. Output only the rubric.",
    buildPlanPrompt(run.question, run.scope.map((c) => c.name)),
    PLAN_MAX_TOKENS,
  );

  await supabase
    .from("research_runs")
    .update({
      documents_snapshot: readable,
      documents_total: readable.length,
      skipped_unsupported: skippedUnsupported,
      rubric: plan.text.trim().slice(0, 4_000),
      cursor: { nextIndex: 0 },
      status: "running",
      tokens_in: plan.tokensIn,
      tokens_out: plan.tokensOut,
      cost_micro_usd: plan.costMicroUsd,
    })
    .eq("id", run.id)
    .eq("status", "planning");

  return {
    status: "running",
    documentsTotal: readable.length,
    documentsProcessed: 0,
    documentsFailed: 0,
    skippedUnsupported,
    newFindings: [],
    answer: null,
    citations: [],
    basis: null,
    failureReason: null,
  };
}

async function advanceRunning(run: RunRow): Promise<AdvanceResult> {
  const supabase = await createSupabaseServerClient();
  const nextIndex = run.cursor?.nextIndex ?? 0;
  const segment = run.documents_snapshot.slice(
    nextIndex,
    nextIndex + RESEARCH_SEGMENT_DOCS,
  );

  if (segment.length === 0) {
    await supabase
      .from("research_runs")
      .update({ status: "synthesizing" })
      .eq("id", run.id)
      .eq("status", "running");
    return { ...emptyResult(run), status: "synthesizing" };
  }

  const targets = await resolveTargets([
    ...new Set(segment.map((doc) => doc.connectionId)),
  ]);
  if (!targets) {
    const reason =
      "A repository connection became unavailable mid-run. Partial findings are kept; check the connection and run again.";
    await failRun(run.id, reason);
    return { ...emptyResult(run), status: "failed", failureReason: reason };
  }

  const ctx = await resolveModelContext(run);
  let usageIn = 0;
  let usageOut = 0;
  let usageCost = 0;

  const findings = await processResearchSegment(segment, {
    readDocument: (doc) =>
      readRemoteDocument(targets.get(doc.connectionId)!, doc.externalId),
    classify: async (batch: ClassifyDocument[]) => {
      const call = await researchModelCall(
        ctx,
        buildClassifySystemPrompt(run.rubric ?? run.question),
        buildClassifyUserPrompt(batch),
        CLASSIFY_MAX_TOKENS,
      );
      usageIn += call.tokensIn;
      usageOut += call.tokensOut;
      usageCost += call.costMicroUsd;
      return parseClassifierOutput(
        call.text,
        batch.map((doc) => doc.externalId),
      );
    },
  });

  // Idempotent persistence: upsert on (run_id, external_id), so replaying an
  // interrupted segment never duplicates findings.
  const { error: upsertError } = await supabase
    .from("research_run_findings")
    .upsert(
      findings.map((finding) => ({
        run_id: run.id,
        external_id: finding.externalId,
        title: finding.title,
        source_url: finding.sourceUrl,
        provenance: finding.provenance,
        relevant: finding.relevant,
        determination: finding.determination,
        supporting_excerpt: finding.supportingExcerpt,
        status: finding.status,
      })),
      { onConflict: "run_id,external_id" },
    );
  if (upsertError) {
    const reason = "The run couldn't save its findings. Run again to resume.";
    await failRun(run.id, reason);
    return { ...emptyResult(run), status: "failed", failureReason: reason };
  }

  // Idempotent counters: RECOUNT from findings rather than incrementing, so a
  // replayed segment cannot double-count.
  const [processedCount, failedCount] = await Promise.all([
    supabase
      .from("research_run_findings")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id),
    supabase
      .from("research_run_findings")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .eq("status", "fetch_failed"),
  ]);
  const documentsProcessed = processedCount.count ?? 0;
  const documentsFailed = failedCount.count ?? 0;

  const newNextIndex = nextIndex + segment.length;
  const done = newNextIndex >= run.documents_total;
  await supabase
    .from("research_runs")
    .update({
      cursor: { nextIndex: newNextIndex },
      documents_processed: documentsProcessed,
      documents_failed: documentsFailed,
      ...(done ? { status: "synthesizing" } : {}),
    })
    .eq("id", run.id)
    .eq("status", "running");

  await addUsageToRun(run.id, usageIn, usageOut, usageCost);

  return {
    status: done ? "synthesizing" : "running",
    documentsTotal: run.documents_total,
    documentsProcessed,
    documentsFailed,
    skippedUnsupported: run.skipped_unsupported,
    newFindings: findings.map(toFindingView),
    answer: null,
    citations: [],
    basis: null,
    failureReason: null,
  };
}

async function advanceSynthesizing(run: RunRow): Promise<AdvanceResult> {
  const supabase = await createSupabaseServerClient();
  const { data: findingRows, error } = await supabase
    .from("research_run_findings")
    .select(
      "external_id, title, source_url, provenance, relevant, determination, supporting_excerpt, status",
    )
    .eq("run_id", run.id)
    .order("created_at", { ascending: true });
  if (error || !findingRows) {
    const reason = "The run couldn't load its findings for synthesis. Run again.";
    await failRun(run.id, reason);
    return { ...emptyResult(run), status: "failed", failureReason: reason };
  }

  const findings = (findingRows as {
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

  const fetchFailed = findings.filter((f) => f.status === "fetch_failed").length;
  const readIncomplete = findings.filter(
    (f) => f.status === "read_incomplete",
  ).length;
  const basis = composeBasisLine({
    documentsRead: findings.length - fetchFailed,
    fetchFailed,
    readIncomplete,
    skippedUnsupported: run.skipped_unsupported,
    collectionNames: run.scope.map((c) => c.name),
  });
  const citations = buildCitations(findings);

  const ctx = await resolveModelContext(run);
  const synthesis = await researchModelCall(
    ctx,
    "You write precise, citation-disciplined answers for legal teams. Plain prose, no markdown headings.",
    buildSynthesisPrompt(
      run.question,
      run.rubric ?? "",
      findings.map((f) => ({
        title: f.title,
        relevant: f.relevant,
        determination: f.determination,
      })),
      basis,
    ),
    SYNTHESIS_MAX_TOKENS,
  );

  await addUsageToRun(run.id, synthesis.tokensIn, synthesis.tokensOut, synthesis.costMicroUsd);
  await supabase
    .from("research_runs")
    .update({
      status: "completed",
      answer: synthesis.text.trim(),
      citations,
      basis,
    })
    .eq("id", run.id)
    .eq("status", "synthesizing");

  return {
    status: "completed",
    documentsTotal: run.documents_total,
    documentsProcessed: run.documents_processed,
    documentsFailed: run.documents_failed,
    skippedUnsupported: run.skipped_unsupported,
    newFindings: [],
    answer: synthesis.text.trim(),
    citations,
    basis,
    failureReason: null,
  };
}

/** Add a segment's usage to the run's rollup (the ledger rows are exact). */
async function addUsageToRun(
  runId: string,
  tokensIn: number,
  tokensOut: number,
  costMicroUsd: number,
): Promise<void> {
  if (tokensIn === 0 && tokensOut === 0 && costMicroUsd === 0) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("research_runs")
    .select("tokens_in, tokens_out, cost_micro_usd")
    .eq("id", runId)
    .maybeSingle();
  const current = (data ?? { tokens_in: 0, tokens_out: 0, cost_micro_usd: 0 }) as {
    tokens_in: number;
    tokens_out: number;
    cost_micro_usd: number;
  };
  await supabase
    .from("research_runs")
    .update({
      tokens_in: current.tokens_in + tokensIn,
      tokens_out: current.tokens_out + tokensOut,
      cost_micro_usd: current.cost_micro_usd + costMicroUsd,
    })
    .eq("id", runId);
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/**
 * Advance a run by one bounded unit of work. The owner's client loop calls
 * this until a terminal status. Cancellation is honored at entry: a run the
 * user cancelled stops here, partial findings intact.
 */
export async function advanceResearchRun(runId: string): Promise<AdvanceResult | null> {
  const run = await loadRun(runId);
  if (!run) return null;

  switch (run.status) {
    case "planning":
      return advancePlanning(run);
    case "running":
      return advanceRunning(run);
    case "synthesizing":
      return advanceSynthesizing(run);
    default:
      // completed / failed / cancelled: report as-is, do nothing.
      return emptyResult(run);
  }
}

// ---------------------------------------------------------------------------
// The cap (organizations.research_document_cap, 0071)
// ---------------------------------------------------------------------------

/** The org's per-run document cap; 200 when the column predates the migration. */
export async function getResearchDocumentCap(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("research_document_cap")
    .maybeSingle();
  if (error) {
    if (error.code !== "42703") {
      console.error("getResearchDocumentCap read failed", { code: error.code });
    }
    return 200;
  }
  const cap = (data?.research_document_cap as number | null) ?? 200;
  return Number.isFinite(cap) && cap > 0 ? cap : 200;
}
