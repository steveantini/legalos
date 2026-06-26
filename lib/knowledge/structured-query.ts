import "server-only";

import { COLLECTION_ATTRIBUTE_TYPES, type CollectionAttributeType } from "@/lib/knowledge/collection-schema";
import { isUndefinedTableError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  runStructuredQuery,
  type ExtractedAttributeValue,
  type StructuredQuery,
  type StructuredQueryResult,
} from "@/lib/deterministic/structured-query";

/**
 * The IMPURE boundary for Structured Query (D-200): load a collection's
 * extracted rows from the database, then hand them to the PURE engine
 * (`runStructuredQuery`, in `lib/deterministic/`). This deliberately lives OUTSIDE
 * the deterministic module — it does I/O — so the pure/impure line stays exactly
 * where the deterministic README's contract put it: the engine never touches the
 * database; this loader never counts or filters (it only fetches and maps).
 *
 * Commit 5 adds the natural-language → query translation and the user-facing
 * question UI ON TOP of this; this commit is the engine plus its thin reader.
 * No model is involved here (extraction already ran in commit 3); this is a
 * read-only count over already-prepared values.
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
