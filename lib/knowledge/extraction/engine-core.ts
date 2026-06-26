import type {
  CollectionAttribute,
  CollectionAttributeType,
} from "@/lib/knowledge/collection-schema";
import {
  coerceAttributeValue,
  verifyCitation,
  type ExtractDocument,
  type PreparationTally,
  type RawExtractedAttribute,
  type StaleWorkItem,
} from "@/lib/knowledge/extraction/extract";

/**
 * The extraction sweep's segment core (Structured Query commit 3): read a slice
 * of stale documents, extract each document's stale attributes with one model
 * call, VERIFY each citation against the source in hand, coerce values to their
 * typed columns, and emit one row per (document, attribute) — including honest
 * not-found rows. A document that cannot be read produces NO rows (so it stays
 * stale and is retried), and is reported as unreadable, never silently dropped.
 *
 * Deterministic orchestration over injected deps (the document reader and the
 * per-document extractor), so the whole segment behavior — unreadable handling,
 * truncation flags, model-omission → not-found, citation verification — is
 * unit-tested with fakes, exactly like the Research segment core. This is NOT
 * an agentic loop: reads are code, and the model is an extractor with a fixed
 * contract.
 */

/** One extracted value, ready for the document_extractions upsert. */
export type ExtractionResultRow = {
  documentId: string;
  attributeKey: string;
  attributeType: CollectionAttributeType;
  found: boolean;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: string | null;
  valueBoolean: boolean | null;
  citationExcerpt: string;
  citationVerified: boolean;
  sourceReadIncomplete: boolean;
  /** The document's modified_at_source AT this extraction (the staleness snapshot). */
  documentModifiedAtSource: string | null;
};

/** What one processed segment yields: the rows to persist, the documents that
 * could not be read (to skip on resume), and the honest tallies. */
export type ExtractionSegmentOutcome = {
  rows: ExtractionResultRow[];
  unreadableDocumentIds: string[];
  tally: PreparationTally;
};

export type ExtractionSegmentDeps = {
  /** Read one document's text (already capped), or null if unreadable. */
  readDocument(
    document: StaleWorkItem["document"],
  ): Promise<{ text: string; truncated: boolean } | null>;
  /** Extract the given attribute keys from one document with a single model call. */
  extract(
    document: ExtractDocument,
    attributeKeys: string[],
  ): Promise<RawExtractedAttribute[]>;
};

function emptyTally(): PreparationTally {
  return {
    documentsPrepared: 0,
    documentsUnreadable: 0,
    attributesFound: 0,
    attributesNotFound: 0,
    attributesUnverified: 0,
    attributesReadIncomplete: 0,
  };
}

/**
 * Process one segment of stale work. For each document: read once; if
 * unreadable, record it as unreadable and emit no rows; otherwise extract its
 * stale attributes, verify each found value's citation against the source text,
 * coerce values to their typed columns, and emit one row per attribute. Honest
 * throughout: a found value with an unverifiable quote keeps its value but is
 * flagged unverified; a not-found on a truncated read is flagged read-incomplete.
 */
export async function processExtractionSegment(
  work: StaleWorkItem[],
  attributes: CollectionAttribute[],
  deps: ExtractionSegmentDeps,
): Promise<ExtractionSegmentOutcome> {
  const typeByKey = new Map<string, CollectionAttributeType>(
    attributes.map((attribute) => [attribute.key, attribute.type]),
  );
  const rows: ExtractionResultRow[] = [];
  const unreadableDocumentIds: string[] = [];
  const tally = emptyTally();

  for (const item of work) {
    const read = await deps.readDocument(item.document);
    if (!read || read.text.trim().length === 0) {
      unreadableDocumentIds.push(item.document.documentId);
      tally.documentsUnreadable += 1;
      continue;
    }

    const extracted = await deps.extract(
      {
        externalId: item.document.externalId,
        title: item.document.title,
        content: read.text,
      },
      item.attributeKeys,
    );
    const byKey = new Map<string, RawExtractedAttribute>(
      extracted.map((result) => [result.attributeKey, result]),
    );

    for (const attributeKey of item.attributeKeys) {
      const type = typeByKey.get(attributeKey) ?? "text";
      // A key the model omitted degrades to an honest not-found.
      const result = byKey.get(attributeKey) ?? {
        attributeKey,
        value: null,
        excerpt: "",
        found: false,
      };

      if (!result.found) {
        rows.push({
          documentId: item.document.documentId,
          attributeKey,
          attributeType: type,
          found: false,
          valueText: null,
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          citationExcerpt: "",
          citationVerified: false,
          sourceReadIncomplete: read.truncated,
          documentModifiedAtSource: item.document.modifiedAtSource,
        });
        tally.attributesNotFound += 1;
        if (read.truncated) tally.attributesReadIncomplete += 1;
        continue;
      }

      const coerced = coerceAttributeValue(type, result.value);
      const citationVerified = verifyCitation(read.text, result.excerpt);
      rows.push({
        documentId: item.document.documentId,
        attributeKey,
        attributeType: type,
        found: true,
        valueText: coerced.valueText,
        valueNumber: coerced.valueNumber,
        valueDate: coerced.valueDate,
        valueBoolean: coerced.valueBoolean,
        citationExcerpt: result.excerpt,
        citationVerified,
        sourceReadIncomplete: read.truncated,
        documentModifiedAtSource: item.document.modifiedAtSource,
      });
      tally.attributesFound += 1;
      if (!citationVerified) tally.attributesUnverified += 1;
      if (read.truncated) tally.attributesReadIncomplete += 1;
    }

    tally.documentsPrepared += 1;
  }

  return { rows, unreadableDocumentIds, tally };
}
