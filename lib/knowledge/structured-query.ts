import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { getOrganizationDefaultModel } from "@/lib/auth/access";
import type { ModelCredential } from "@/lib/connections/providers/types";
import {
  runStructuredQuery,
  type ExtractedAttributeValue,
  type StructuredQuery,
  type StructuredQueryResult,
} from "@/lib/deterministic/structured-query";
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  parseDraftOutput,
} from "@/lib/knowledge/attribute-draft";
import { COLLECTION_ATTRIBUTE_TYPES, type CollectionAttributeType } from "@/lib/knowledge/collection-schema";
import { getVisibleCollections } from "@/lib/knowledge/collections-data";
import type { ProposedAttribute } from "@/lib/knowledge/schema-suggestions-shared";
import type {
  MatchedDocument,
  QueryableAttribute,
  QueryableCollection,
  StructuredQueryHistoryItem,
} from "@/lib/knowledge/structured-query-shared";
import {
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
  parseTranslationOutput,
  type TranslationOutcome,
} from "@/lib/knowledge/structured-query-translate";
import {
  streamAnthropicChat,
  type AnthropicSystemBlock,
} from "@/lib/llm/anthropic/chat";
import { resolveModelCredential } from "@/lib/llm/model-credential";
import { DEFAULT_MODEL_FALLBACK } from "@/lib/llm/models";
import { parseModelId } from "@/lib/llm/parse-model-id";
import { computeCostMicroUsd } from "@/lib/llm/pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUndefinedTableError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The IMPURE boundary for Structured Query (commit 5). It is everything the
 * question surface needs that the PURE engine (`runStructuredQuery`, in
 * `lib/deterministic/`) must never touch: the ONE model call that TRANSLATES a
 * plain-language question into the engine's IR, the database reads that feed and
 * verify a count, and the member-facing collection/history reads. The pure/
 * impure line stays exactly where the deterministic README's contract put it —
 * the engine never does I/O or calls a model; this module never counts or
 * filters (the engine does). The model PROPOSES the IR here; the pure engine
 * DISPOSES.
 *
 * MODEL-AGNOSTIC, by the same path Research and extraction use:
 * `structuredQueryModelCall` rides `streamAnthropicChat` through the per-org
 * default-model + credential resolution (managed or bring-your-own key), and
 * logs spend to `usage_events` (org + user + model, no agent, no research run).
 */

const ATTRIBUTE_TYPES = new Set<string>(COLLECTION_ATTRIBUTE_TYPES);

function toAttributeType(value: string): CollectionAttributeType {
  // The column is written from the snapshotted schema type; default defensively.
  return ATTRIBUTE_TYPES.has(value) ? (value as CollectionAttributeType) : "text";
}

/**
 * Run a structured query over one collection's prepared documents. RLS scopes
 * every read to the caller's organization. The scope is the collection's
 * present, anchored documents; their extracted values (every attribute, shared
 * across collections by the document anchor) are loaded and the pure engine
 * counts. Tolerant of the pre-migration window: an absent `document_extractions`
 * table reads as "nothing prepared", so the engine returns an honest zero result
 * rather than failing.
 */
export async function runCollectionStructuredQuery(
  collectionId: string,
  query: StructuredQuery,
): Promise<StructuredQueryResult> {
  const supabase = await createSupabaseServerClient();

  // The collection's present, anchored documents (the query's document scope).
  const { data: invData, error: invError } = await supabase
    .from("collection_documents")
    .select("document_id")
    .eq("collection_id", collectionId)
    .eq("status", "present")
    .not("document_id", "is", null);
  if (invError) {
    console.error("structured-query inventory read failed", { code: invError.code });
    return runStructuredQuery([], query);
  }

  const documentIds = [
    ...new Set(
      (invData ?? [])
        .map((r) => (r as { document_id: string | null }).document_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  if (documentIds.length === 0) return runStructuredQuery([], query);

  // The extracted values for those documents (every attribute; the engine reads
  // only the ones the query references, and counts documents that have any row).
  const { data: exData, error: exError } = await supabase
    .from("document_extractions")
    .select(
      "document_id, attribute_key, attribute_type, found, value_text, value_number, value_date, value_boolean, citation_verified, source_read_incomplete",
    )
    .in("document_id", documentIds);
  if (exError) {
    if (!isUndefinedTableError(exError)) {
      console.error("document_extractions read failed", { code: exError.code });
    }
    // Absent table or read failure → nothing prepared; honest zero result.
    return runStructuredQuery([], query);
  }

  const rows: ExtractedAttributeValue[] = (exData ?? []).map((raw) => {
    const r = raw as {
      document_id: string;
      attribute_key: string;
      attribute_type: string;
      found: boolean;
      value_text: string | null;
      value_number: number | null;
      value_date: string | null;
      value_boolean: boolean | null;
      citation_verified: boolean;
      source_read_incomplete: boolean;
    };
    return {
      documentId: r.document_id,
      attributeKey: r.attribute_key,
      attributeType: toAttributeType(r.attribute_type),
      found: r.found,
      valueText: r.value_text,
      valueNumber: r.value_number,
      valueDate: r.value_date,
      valueBoolean: r.value_boolean,
      citationVerified: r.citation_verified,
      sourceReadIncomplete: r.source_read_incomplete,
    };
  });

  return runStructuredQuery(rows, query);
}

// ---------------------------------------------------------------------------
// NL → IR translation (the one model step) — model-agnostic, the extraction idiom
// ---------------------------------------------------------------------------

type ModelContext = {
  organizationId: string;
  userId: string;
  modelId: string; // full canonical id (vendor/model), for pricing + the ledger
  bareModel: string; // bare id for the SDK call
  credential: ModelCredential;
};

/** Output budget for the translation: a small JSON envelope, never prose. */
const TRANSLATE_MAX_TOKENS = 1_000;

async function resolveKnowledgeModelContext(
  organizationId: string,
  userId: string,
): Promise<ModelContext> {
  const modelId = (await getOrganizationDefaultModel()) ?? DEFAULT_MODEL_FALLBACK;
  const { vendor, model } = parseModelId(modelId);
  const credential = await resolveModelCredential({ organizationId, userId, vendor });
  return { organizationId, userId, modelId, bareModel: model, credential };
}

/** One non-streaming translation model call: drive the SDK stream to completion,
 * record the usage ledger row (org + user + model, no agent, no research run),
 * and return the text. Failure to log never fails the call. Mirrors
 * extractionModelCall exactly so model-agnosticism is identical across features. */
async function structuredQueryModelCall(
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
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
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
    console.error("structured-query cost computation failed — recording 0", err);
  }

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
      console.error("structured-query usage_events insert failed", { code: error.code });
    }
  } catch (err) {
    console.error("structured-query usage_events insert threw", err);
  }

  return text;
}

/**
 * Translate a plain-language question into the structured-query IR against a
 * collection's fields. The model proposes; the defensive parser + the commit-4
 * zod schema + the known-key check decide (an off-schema or malformed query
 * never reaches the engine). A model-call failure degrades to `unparseable`
 * (an honest "I could not turn that into an exact query"), never a thrown 500.
 */
export async function translateQuestionToQuery(args: {
  question: string;
  attributes: QueryableAttribute[];
  organizationId: string;
  userId: string;
}): Promise<TranslationOutcome> {
  const { question, attributes, organizationId, userId } = args;
  const ctx = await resolveKnowledgeModelContext(organizationId, userId);
  let text: string;
  try {
    text = await structuredQueryModelCall(
      ctx,
      buildTranslateSystemPrompt(attributes),
      buildTranslateUserPrompt(question),
      TRANSLATE_MAX_TOKENS,
    );
  } catch (err) {
    console.error("structured-query translation model call failed", err);
    return { kind: "unparseable" };
  }
  return parseTranslationOutput(text, attributes.map((a) => a.key));
}

/** Output budget for an attribute draft: a single small JSON object. */
const DRAFT_MAX_TOKENS = 600;

/**
 * Draft a proposed attribute definition for schema-grows-on-demand (phase two):
 * from a gapped question and the concept it asked about, propose a label, type,
 * options (for enum), and the load-bearing description. Reuses the SAME
 * model-agnostic call as translation. The result is a PROPOSAL an admin reviews
 * and edits before anything is committed; null when the model produced nothing
 * usable (the caller then offers a minimal editable draft). The model never
 * answers the question, only proposes a structure to track it.
 */
export async function draftAttributeDefinition(args: {
  question: string;
  missingConcept: string;
  existing: QueryableAttribute[];
  organizationId: string;
  userId: string;
}): Promise<ProposedAttribute | null> {
  const { question, missingConcept, existing, organizationId, userId } = args;
  const ctx = await resolveKnowledgeModelContext(organizationId, userId);
  let text: string;
  try {
    text = await structuredQueryModelCall(
      ctx,
      buildDraftSystemPrompt(existing),
      buildDraftUserPrompt(question, missingConcept),
      DRAFT_MAX_TOKENS,
    );
  } catch (err) {
    console.error("attribute draft model call failed", err);
    return null;
  }
  return parseDraftOutput(text);
}

// ---------------------------------------------------------------------------
// Citations for matched documents (the count made CHECKABLE)
// ---------------------------------------------------------------------------

type CitationValue = MatchedDocument["values"][number];

/**
 * For the matched documents, load the supporting citation(s) so a count is
 * verifiable, not just asserted: per document, its title and, for each attribute
 * the query referenced, the found value with its verbatim quote and verification
 * flag. Titles come from the member-readable inventory (`collection_documents`;
 * the `documents` anchor read is admin-only), values from `document_extractions`
 * (member-readable for a visible collection as of this commit's migration).
 * Returns one entry per input id, in the given order.
 */
export async function loadMatchedCitations(
  collectionId: string,
  documentIds: string[],
  referencedAttributes: QueryableAttribute[],
): Promise<MatchedDocument[]> {
  if (documentIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();

  const { data: invData } = await supabase
    .from("collection_documents")
    .select("document_id, title")
    .eq("collection_id", collectionId)
    .in("document_id", documentIds);
  const titleByDoc = new Map<string, string>();
  for (const raw of invData ?? []) {
    const r = raw as { document_id: string | null; title: string };
    if (r.document_id) titleByDoc.set(r.document_id, r.title);
  }

  const labelByKey = new Map(referencedAttributes.map((a) => [a.key, a.label]));
  const keys = referencedAttributes.map((a) => a.key);
  const valuesByDoc = new Map<string, CitationValue[]>();
  if (keys.length > 0) {
    const { data: exData, error } = await supabase
      .from("document_extractions")
      .select("document_id, attribute_key, value_text, citation_excerpt, citation_verified")
      .in("document_id", documentIds)
      .in("attribute_key", keys)
      .eq("found", true);
    if (error && !isUndefinedTableError(error)) {
      console.error("structured-query citations read failed", { code: error.code });
    }
    for (const raw of exData ?? []) {
      const r = raw as {
        document_id: string;
        attribute_key: string;
        value_text: string | null;
        citation_excerpt: string | null;
        citation_verified: boolean;
      };
      const list = valuesByDoc.get(r.document_id) ?? [];
      list.push({
        label: labelByKey.get(r.attribute_key) ?? r.attribute_key,
        value: r.value_text ?? "",
        excerpt: r.citation_excerpt ?? "",
        verified: r.citation_verified,
      });
      valuesByDoc.set(r.document_id, list);
    }
  }

  return documentIds.map((id) => ({
    documentId: id,
    title: titleByDoc.get(id)?.trim() || "Untitled document",
    values: valuesByDoc.get(id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Member-facing reads (the query surface)
// ---------------------------------------------------------------------------

/**
 * The collections the current user can QUERY: their RLS-visible collections that
 * define at least one attribute, projected to the member-facing shape (label /
 * type / options — never the admin's extraction `description`). Reuses
 * `getVisibleCollections` so visibility, preparation state, and counts come from
 * the one source; the schema attributes are readable to members for visible
 * collections as of this commit's migration.
 */
export async function getQueryableCollections(): Promise<QueryableCollection[]> {
  const collections = await getVisibleCollections();
  return collections
    .filter((c) => c.schemaAttributes.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      provenance: c.sources.map((s) => s.displayPath),
      documentCount: c.presentCount,
      lastSyncedAt: c.lastSyncedAt,
      attributes: c.schemaAttributes.map((a) => ({
        key: a.key,
        label: a.label,
        type: a.type,
        ...(a.options && a.options.length > 0 ? { options: a.options } : {}),
      })),
      preparationState: c.preparationState,
    }));
}

/**
 * The user's recent asked questions (own, plus the org's for admins, per RLS),
 * newest first. Tolerant of the pre-migration window: an absent
 * `structured_queries` table reads as "no history yet".
 */
export async function listStructuredQueries(
  limit = 20,
): Promise<StructuredQueryHistoryItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("structured_queries")
    .select(
      "id, question, interpreted_summary, understood, matched_count, total_count, collection_id, created_at, collections(name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!isUndefinedTableError(error)) {
      console.error("structured_queries read failed", { code: error.code });
    }
    return [];
  }
  return (data ?? []).map((raw) => {
    // The to-one `collections` embed is a single object at runtime; cast through
    // unknown since these reads are not backed by generated DB types.
    const r = raw as unknown as {
      id: string;
      question: string;
      interpreted_summary: string;
      understood: boolean;
      matched_count: number | null;
      total_count: number | null;
      collection_id: string;
      created_at: string;
      collections: { name: string } | null;
    };
    return {
      id: r.id,
      question: r.question,
      interpretedSummary: r.interpreted_summary,
      understood: r.understood,
      matchedCount: r.matched_count,
      totalCount: r.total_count,
      collectionId: r.collection_id,
      collectionName: r.collections?.name ?? "a collection",
      createdAt: r.created_at,
    };
  });
}
