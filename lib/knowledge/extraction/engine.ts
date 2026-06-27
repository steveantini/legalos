import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { getOrganizationDefaultModel } from "@/lib/auth/access";
import {
  parseCollectionAttributes,
  type CollectionAttribute,
} from "@/lib/knowledge/collection-schema";
import {
  buildExtractSystemPrompt,
  buildExtractUserPrompt,
  composePreparationBasis,
  parseExtractionOutput,
  selectStaleExtractionWork,
  type ExistingExtraction,
  type ExtractDocument,
  type ExtractionDocumentRef,
  type PreparationTally,
} from "@/lib/knowledge/extraction/extract";
import {
  processExtractionSegment,
  type ExtractionResultRow,
} from "@/lib/knowledge/extraction/engine-core";
import { dedupeDocumentRefsById } from "@/lib/knowledge/folder-collections";
import {
  readRemoteDocument,
  type EnumerationTarget,
} from "@/lib/knowledge/enumeration";
import { resolveEnumerationTarget } from "@/lib/knowledge/targets";
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
import { isUndefinedTableError } from "@/lib/supabase/errors";

/**
 * The Structured Query EXTRACTION engine (commit 3): a DETERMINISTIC,
 * STATE-RECONCILING sweep over a collection's documents, REUSING the Research
 * machinery (the 60k document read budget, the MCP adapters, the segmented
 * client-driven loop) and swapping classify → extract. It is the model step
 * behind the admin-triggered "Prepare" / "Update" action.
 *
 * RECONCILE, NEVER RE-DO. Each advance recomputes the stale (document,
 * attribute) work set from DERIVED staleness (extract.ts) and extracts ONLY the
 * stale pairs — a document/attribute already current is skipped, so each pair
 * is extracted once unless the document or the schema changed. There is no runs
 * table: the document_extractions rows ARE the persisted progress, so a large
 * first Prepare resumes simply by recomputing what is still stale. Documents
 * that cannot be read stay stale and are carried as failedDocumentIds so a run
 * advances past them instead of looping (the only state the client round-trips).
 *
 * MODEL-AGNOSTIC. extractionModelCall rides streamAnthropicChat through the
 * same per-org default-model + credential resolution Research uses (managed or
 * bring-your-own key), so swapping models never touches the extraction or
 * storage contract. Spend is logged to usage_events attributed to org + user +
 * model, with no agent and no research run (reconciliation has no run record);
 * the platform Cost views aggregate org-wide, so it flows in automatically.
 */

/** Documents read + extracted per advance (each is one read + one model call). */
const EXTRACT_SEGMENT_DOCS = 4;
/** Output budget for an N-attribute extraction object (Research's 4k is too
 * small for up to 24 attributes of value + verbatim excerpt). */
const EXTRACT_MAX_TOKENS = 8_000;

/** What one advance reports to the client loop. The client accumulates the
 * per-call tally and composes the final honest basis with composePreparationBasis. */
export type PrepareSegmentResult =
  | { ok: false; error: string }
  | {
      ok: true;
      completed: boolean;
      /** Total stale documents this call sees (the run's denominator on call 1). */
      documentsStale: number;
      /** Per-call tally deltas (documents + attributes). */
      tally: PreparationTally;
      /** Documents that could not be read, carried forward so the run advances. */
      failedDocumentIds: string[];
    };

type ModelContext = {
  organizationId: string;
  userId: string;
  modelId: string; // full canonical id (vendor/model), for pricing + the ledger
  bareModel: string; // bare id for the SDK call
  credential: ModelCredential;
};

// ---------------------------------------------------------------------------
// Model call + ledger (model-agnostic, the researchModelCall idiom)
// ---------------------------------------------------------------------------

async function resolveExtractionModelContext(
  organizationId: string,
  userId: string,
): Promise<ModelContext> {
  const modelId = (await getOrganizationDefaultModel()) ?? DEFAULT_MODEL_FALLBACK;
  const { vendor, model } = parseModelId(modelId);
  const credential = await resolveModelCredential({
    organizationId,
    userId,
    vendor,
  });
  return { organizationId, userId, modelId, bareModel: model, credential };
}

/** One non-streaming extraction model call: drive the SDK stream to completion,
 * record the usage ledger row (org + user + model attribution, no agent, no
 * research run), and return the text. Failure to log never fails the run. */
async function extractionModelCall(
  ctx: ModelContext,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
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
    console.error("extraction cost computation failed — recording 0", err);
  }

  // The ledger row: no agent_id and no research_run_id (both nullable since
  // 0071) — extraction has neither. Service-role insert, the run-agent
  // divergence; failure logs and never fails the run.
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("usage_events").insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      model: ctx.modelId,
      tokens_in: usage.input_tokens,
      tokens_out: usage.output_tokens,
      cache_creation_tokens: usage.cache_creation_input_tokens,
      cache_read_tokens: usage.cache_read_input_tokens,
      web_search_count: 0,
      cost_micro_usd: costMicroUsd,
    });
    if (error) {
      console.error("extraction usage_events insert failed", { code: error.code });
    }
  } catch (err) {
    console.error("extraction usage_events insert threw", err);
  }

  return text;
}

// ---------------------------------------------------------------------------
// Loading the reconcile inputs
// ---------------------------------------------------------------------------

type SchemaRow = { id: string; version: number; attributes: unknown };

type InventoryRow = {
  document_id: string;
  documents: {
    external_id: string;
    title: string;
    source_url: string | null;
    connection_id: string;
    modified_at_source: string | null;
  } | null;
};

/**
 * Present, anchored documents across EVERY folder sharing this schema (the set),
 * deduped to one ref per anchor (Step 3a). A file reachable through two folders
 * of the set is one document, so it is extracted ONCE (extract-once across the
 * set). For a set-of-one this returns exactly the home folder's documents, so
 * behavior is identical to the prior per-collection load.
 */
async function loadSchemaSetDocuments(
  schemaId: string,
): Promise<ExtractionDocumentRef[]> {
  const supabase = await createSupabaseServerClient();
  const { data: members, error: membersError } = await supabase
    .from("collections")
    .select("id")
    .eq("schema_id", schemaId);
  if (membersError || !members) return [];
  const collectionIds = (members as { id: string }[]).map((m) => m.id);
  if (collectionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("collection_documents")
    .select(
      "document_id, documents(external_id, title, source_url, connection_id, modified_at_source)",
    )
    .in("collection_id", collectionIds)
    .eq("status", "present")
    .not("document_id", "is", null);
  if (error || !data) return [];

  const refs: ExtractionDocumentRef[] = [];
  for (const row of data as unknown as InventoryRow[]) {
    const anchor = row.documents;
    if (!row.document_id || !anchor) continue;
    refs.push({
      documentId: row.document_id,
      externalId: anchor.external_id,
      title: anchor.title,
      connectionId: anchor.connection_id,
      sourceUrl: anchor.source_url,
      modifiedAtSource: anchor.modified_at_source,
    });
  }
  return dedupeDocumentRefsById(refs);
}

/** Existing extraction rows for these documents (the staleness inputs). Tolerates
 * the pre-migration window: an absent table reads as "nothing extracted yet". */
async function loadExistingExtractions(
  documentIds: string[],
): Promise<ExistingExtraction[]> {
  if (documentIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_extractions")
    .select(
      "document_id, attribute_key, document_modified_at_source, extracted_against_schema_version, source_collection_schema_id",
    )
    .in("document_id", documentIds);
  if (error) {
    if (!isUndefinedTableError(error)) {
      console.error("document_extractions read failed", { code: error.code });
    }
    return [];
  }
  return (data as {
    document_id: string;
    attribute_key: string;
    document_modified_at_source: string | null;
    extracted_against_schema_version: number;
    source_collection_schema_id: string | null;
  }[]).map((row) => ({
    documentId: row.document_id,
    attributeKey: row.attribute_key,
    documentModifiedAtSource: row.document_modified_at_source,
    extractedAgainstSchemaVersion: row.extracted_against_schema_version,
    sourceCollectionSchemaId: row.source_collection_schema_id,
  }));
}

// ---------------------------------------------------------------------------
// The advance entry point
// ---------------------------------------------------------------------------

/**
 * Advance a collection's preparation by one bounded segment. Recomputes the
 * stale work set, skips documents already failed this run, reads and extracts
 * the next few stale documents, verifies citations, and upserts the resulting
 * values idempotently (on document_id + attribute_key). Returns completed when
 * no readable stale work remains.
 */
export async function advanceCollectionPreparation(args: {
  collectionId: string;
  organizationId: string;
  userId: string;
  failedDocumentIds: string[];
}): Promise<PrepareSegmentResult> {
  const { collectionId, organizationId, userId } = args;
  const supabase = await createSupabaseServerClient();

  // 1) Resolve the schema (the document KIND) this folder belongs to, then load
  //    the schema entity. Per-set: the schema is shared via collections.schema_id,
  //    so preparing one folder prepares its whole set (below). Set-of-one behaves
  //    exactly as the prior per-collection reconcile.
  const { data: colData, error: colError } = await supabase
    .from("collections")
    .select("schema_id")
    .eq("id", collectionId)
    .maybeSingle();
  if (colError) {
    return { ok: false, error: "Could not load this collection." };
  }
  const schemaId = (colData as { schema_id: string | null } | null)?.schema_id ?? null;
  if (!schemaId) {
    return {
      ok: false,
      error: "Define a schema for this collection before preparing it.",
    };
  }
  const { data: schemaData, error: schemaError } = await supabase
    .from("collection_schemas")
    .select("id, version, attributes")
    .eq("id", schemaId)
    .maybeSingle();
  if (schemaError) {
    return { ok: false, error: "Could not load this collection's schema." };
  }
  const schemaRow = schemaData as SchemaRow | null;
  if (!schemaRow) {
    return {
      ok: false,
      error: "Define a schema for this collection before preparing it.",
    };
  }
  const attributes: CollectionAttribute[] = parseCollectionAttributes(
    schemaRow.attributes,
  );
  if (attributes.length === 0) {
    return {
      ok: false,
      error: "This collection's schema has no attributes to extract yet.",
    };
  }

  // 2) The set's documents (every folder sharing this schema, deduped to one
  //    ref per anchor → extract-once) and existing extractions → stale work.
  const documents = await loadSchemaSetDocuments(schemaRow.id);
  const existing = await loadExistingExtractions(
    documents.map((document) => document.documentId),
  );
  const staleWork = selectStaleExtractionWork(
    documents,
    attributes,
    schemaRow.id,
    schemaRow.version,
    existing,
  );

  const failed = new Set(args.failedDocumentIds);
  const remaining = staleWork.filter(
    (item) => !failed.has(item.document.documentId),
  );

  // Nothing readable left to do — the run is complete.
  if (remaining.length === 0) {
    return {
      ok: true,
      completed: true,
      documentsStale: staleWork.length,
      tally: {
        documentsPrepared: 0,
        documentsUnreadable: 0,
        attributesFound: 0,
        attributesNotFound: 0,
        attributesUnverified: 0,
        attributesReadIncomplete: 0,
      },
      failedDocumentIds: args.failedDocumentIds,
    };
  }

  const segment = remaining.slice(0, EXTRACT_SEGMENT_DOCS);

  // 3) Resolve each connection's live read target once for this segment.
  const targets = new Map<string, EnumerationTarget>();
  for (const connectionId of new Set(
    segment.map((item) => item.document.connectionId),
  )) {
    const target = await resolveEnumerationTarget(connectionId);
    if (target) targets.set(connectionId, target);
  }

  const ctx = await resolveExtractionModelContext(organizationId, userId);
  const attributeByKey = new Map(attributes.map((a) => [a.key, a]));

  // 4) Read + extract the segment (deterministic core; injected deps).
  const outcome = await processExtractionSegment(segment, attributes, {
    readDocument: async (document) => {
      const target = targets.get(document.connectionId);
      if (!target) return null; // unreadable connection → stays stale, reported
      return readRemoteDocument(target, document.externalId);
    },
    extract: async (document: ExtractDocument, attributeKeys: string[]) => {
      const subset = attributeKeys
        .map((key) => attributeByKey.get(key))
        .filter((a): a is CollectionAttribute => Boolean(a));
      const text = await extractionModelCall(
        ctx,
        buildExtractSystemPrompt(subset),
        buildExtractUserPrompt(document),
        EXTRACT_MAX_TOKENS,
      );
      return parseExtractionOutput(text, attributeKeys);
    },
  });

  // 5) Persist values idempotently (on document_id + attribute_key), so a
  //    replayed segment overwrites rather than duplicates.
  if (outcome.rows.length > 0) {
    const nowIso = new Date().toISOString();
    const payload = outcome.rows.map((row: ExtractionResultRow) => ({
      document_id: row.documentId,
      organization_id: organizationId,
      source_collection_schema_id: schemaRow.id,
      attribute_key: row.attributeKey,
      attribute_type: row.attributeType,
      found: row.found,
      value_text: row.valueText,
      value_number: row.valueNumber,
      value_date: row.valueDate,
      value_boolean: row.valueBoolean,
      citation_excerpt: row.citationExcerpt,
      citation_verified: row.citationVerified,
      source_read_incomplete: row.sourceReadIncomplete,
      extracted_at: nowIso,
      extracted_against_schema_version: schemaRow.version,
      extracted_model_id: ctx.modelId,
      document_modified_at_source: row.documentModifiedAtSource,
    }));
    const { error: upsertError } = await supabase
      .from("document_extractions")
      .upsert(payload, { onConflict: "document_id,attribute_key" });
    if (upsertError) {
      return {
        ok: false,
        error: "The values could not be saved. Update the collection to resume.",
      };
    }
  }

  const failedDocumentIds = [
    ...args.failedDocumentIds,
    ...outcome.unreadableDocumentIds,
  ];

  return {
    ok: true,
    // Complete when this segment covered all the remaining readable work.
    completed: remaining.length <= EXTRACT_SEGMENT_DOCS,
    documentsStale: staleWork.length,
    tally: outcome.tally,
    failedDocumentIds,
  };
}

/** Re-export for the action's convenience (the client composes the final line). */
export { composePreparationBasis };
