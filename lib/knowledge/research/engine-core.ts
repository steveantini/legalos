import {
  batchForClassification,
  type ClassifierFinding,
  type ClassifyDocument,
} from "@/lib/knowledge/research/classify";
import type {
  ResearchDocumentRef,
  ResearchFindingView,
} from "@/lib/knowledge/research/shared";

/**
 * The research sweep's segment core (Knowledge arc Step 2): read a slice of
 * documents, classify them in batches, and emit one finding per document —
 * including an HONEST finding for every document that could not be read
 * (fetch_failed) or was only partially readable (read_incomplete). Nothing
 * is silently dropped; every input document yields exactly one finding.
 *
 * Deterministic orchestration over injected deps (the document reader and
 * the batch classifier), so the whole segment behavior — failure findings,
 * truncation flags, classifier-omission handling — is unit-tested with
 * fakes, exactly like the sync engine. This is NOT the chat agentic loop:
 * reads and batching are code; the model is a classifier with a fixed
 * contract.
 */

export type SegmentDeps = {
  /** Read one document's text (already capped), or null if unreadable. */
  readDocument(
    doc: ResearchDocumentRef,
  ): Promise<{ text: string; truncated: boolean } | null>;
  /** Run one classification model call over a batch. */
  classify(batch: ClassifyDocument[]): Promise<ClassifierFinding[]>;
};

/** One finding the segment produces (the row the engine upserts). */
export type SegmentFinding = Omit<ResearchFindingView, "sourceUrl"> & {
  sourceUrl: string | null;
};

const NO_DETERMINATION =
  "No determination was returned for this document; review it directly.";

/**
 * Process one segment of documents. Returns a finding per input document:
 *   - unreadable        → status 'fetch_failed', not classified
 *   - truncated read    → status 'read_incomplete', classified on the part read
 *   - classifier omitted → status from the read, determination says so honestly
 */
export async function processResearchSegment(
  documents: ResearchDocumentRef[],
  deps: SegmentDeps,
): Promise<SegmentFinding[]> {
  const findings = new Map<string, SegmentFinding>();
  const toClassify: ClassifyDocument[] = [];
  const readStatus = new Map<string, "ok" | "read_incomplete">();

  for (const doc of documents) {
    const read = await deps.readDocument(doc);
    if (!read || read.text.trim().length === 0) {
      findings.set(doc.externalId, {
        externalId: doc.externalId,
        title: doc.title,
        sourceUrl: doc.sourceUrl,
        provenance: doc.provenance,
        relevant: null,
        determination: "This document could not be read from its repository.",
        supportingExcerpt: "",
        status: "fetch_failed",
      });
      continue;
    }
    readStatus.set(doc.externalId, read.truncated ? "read_incomplete" : "ok");
    toClassify.push({
      externalId: doc.externalId,
      title: doc.title,
      content: read.text,
    });
  }

  for (const batch of batchForClassification(toClassify)) {
    const results = await deps.classify(batch);
    const byId = new Map(results.map((r) => [r.externalId, r]));
    for (const doc of batch) {
      const ref = documents.find((d) => d.externalId === doc.externalId)!;
      const status = readStatus.get(doc.externalId) ?? "ok";
      const result = byId.get(doc.externalId);
      findings.set(doc.externalId, {
        externalId: doc.externalId,
        title: ref.title,
        sourceUrl: ref.sourceUrl,
        provenance: ref.provenance,
        relevant: result ? result.relevant : null,
        determination: result ? result.determination : NO_DETERMINATION,
        supportingExcerpt: result ? result.excerpt : "",
        status,
      });
    }
  }

  // Emit in input order, one finding per document, no exceptions.
  return documents.map((doc) => findings.get(doc.externalId)!);
}
