/**
 * Pure, client-safe pieces of the research engine (Knowledge arc Step 2):
 * the cost/time preview math, the readable-type filter, and the shapes the
 * surface and the actions share. No network, no server imports — the scope
 * picker computes previews locally from these, and the tests pin the math.
 */

/** A citation in the established sources idiom (messages.sources, 0014). */
export type ResearchCitation = {
  id: string;
  title: string;
  url: string;
  domain: string;
};

/** One document in a run's enumerated snapshot. */
export type ResearchDocumentRef = {
  externalId: string;
  title: string;
  mimeType: string;
  sourceUrl: string | null;
  connectionId: string;
  serverId: string;
  /** Collection/source display provenance for the finding row. */
  provenance: string;
};

/** One per-document finding as the surface renders it. */
export type ResearchFindingView = {
  externalId: string;
  title: string;
  sourceUrl: string | null;
  provenance: string;
  relevant: boolean | null;
  determination: string;
  supportingExcerpt: string;
  status: "ok" | "fetch_failed" | "read_incomplete";
};

export type ResearchRunStatus =
  | "planning"
  | "running"
  | "synthesizing"
  | "completed"
  | "failed"
  | "cancelled";

/** A run as the surface renders it (list + detail). */
export type ResearchRunView = {
  id: string;
  /** The asker (admins can read others' runs; only the asker drives one). */
  ownerUserId: string;
  question: string;
  status: ResearchRunStatus;
  scope: { id: string; name: string; provenance: string[] }[];
  documentsTotal: number;
  documentsProcessed: number;
  documentsFailed: number;
  skippedUnsupported: number;
  answer: string | null;
  citations: ResearchCitation[];
  basis: string | null;
  failureReason: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Readable types
// ---------------------------------------------------------------------------

/**
 * The document types the sweep reads — the intersection the repositories'
 * content tools support (Drive's read_file_content list; Box reads the same
 * office/PDF/text family). Anything else is counted and reported in the
 * answer's basis line, never silently dropped.
 */
const READABLE_MIME_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/x-vnd.oasis.opendocument.text",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

export function isReadableMimeType(mimeType: string): boolean {
  return READABLE_MIME_TYPES.has(mimeType);
}

// ---------------------------------------------------------------------------
// Preview math
// ---------------------------------------------------------------------------

/** Documents read per engine segment (sized to the request budget). */
export const RESEARCH_SEGMENT_DOCS = 12;

/**
 * Preview assumptions, stated rather than hidden: a typical legal document
 * runs ~2k–10k tokens of input, classification writes ~150 tokens per
 * document, and planning + synthesis add a small fixed overhead. The range
 * is honest spread, not false precision.
 */
const ASSUMED_TOKENS_PER_DOC_LOW = 2_000;
const ASSUMED_TOKENS_PER_DOC_HIGH = 10_000;
const ASSUMED_OUTPUT_TOKENS_PER_DOC = 150;
const OVERHEAD_TOKENS_IN = 8_000;
const OVERHEAD_TOKENS_OUT = 2_500;
/** Minutes per segment, low/high (reads + one or two model calls). */
const MINUTES_PER_SEGMENT_LOW = 0.8;
const MINUTES_PER_SEGMENT_HIGH = 2;

export type ResearchPreview = {
  documentCount: number;
  /** Whole-dollar honest range. */
  estCostLowUsd: number;
  estCostHighUsd: number;
  /** Whole-minute honest range. */
  estMinutesLow: number;
  estMinutesHigh: number;
  /** True when the scope exceeds the org's per-run cap. */
  overCap: boolean;
  cap: number;
};

/**
 * The pre-run preview, computed from the inventory count, the org's cap, and
 * the model's per-token pricing (dollars per million tokens in/out).
 */
export function estimateResearchPreview(
  documentCount: number,
  cap: number,
  pricing: { inputPerMillion: number; outputPerMillion: number },
): ResearchPreview {
  const count = Math.max(0, documentCount);
  const costAt = (tokensPerDoc: number) =>
    ((count * tokensPerDoc + OVERHEAD_TOKENS_IN) / 1_000_000) *
      pricing.inputPerMillion +
    ((count * ASSUMED_OUTPUT_TOKENS_PER_DOC + OVERHEAD_TOKENS_OUT) /
      1_000_000) *
      pricing.outputPerMillion;
  const segments = Math.max(1, Math.ceil(count / RESEARCH_SEGMENT_DOCS));
  return {
    documentCount: count,
    estCostLowUsd: Math.max(1, Math.round(costAt(ASSUMED_TOKENS_PER_DOC_LOW))),
    estCostHighUsd: Math.max(
      1,
      Math.round(costAt(ASSUMED_TOKENS_PER_DOC_HIGH)),
    ),
    estMinutesLow: Math.max(1, Math.round(segments * MINUTES_PER_SEGMENT_LOW)),
    estMinutesHigh: Math.max(
      1,
      Math.round(segments * MINUTES_PER_SEGMENT_HIGH),
    ),
    overCap: count > cap,
    cap,
  };
}
