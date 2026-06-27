/**
 * Pure, client-safe pieces of the research engine (Knowledge arc Step 2):
 * the document/time preview math, the over-limit messages, the readable-type
 * filter, and the shapes the surface and the actions share. No network, no
 * server imports — the scope picker computes previews locally from these, and
 * the tests pin the math.
 */

/** One scope option the Research composer offers: a folder-backed (or legacy
 * admin-curated) collection the user can ask over. Lives here, client-safe, so
 * the composer, the view, and the server actions share one shape. */
export type ScopeOption = {
  id: string;
  name: string;
  description: string;
  /** Source provenance paths, always shown (the transparency rule). */
  provenance: string[];
  documentCount: number;
  lastSyncedAt: string | null;
};

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

/** Minutes per segment, low/high (reads + one or two model calls). */
const MINUTES_PER_SEGMENT_LOW = 0.8;
const MINUTES_PER_SEGMENT_HIGH = 2;

export type ResearchPreview = {
  documentCount: number;
  /** Whole-minute honest range. */
  estMinutesLow: number;
  estMinutesHigh: number;
  /** True when the scope exceeds the org's per-run cap. */
  overCap: boolean;
  cap: number;
};

/**
 * The pre-run preview, computed from the inventory document count and the
 * org's per-run cap. Document count and a rough time range only: money is
 * never shown to the user (the per-run cap, not a dollar figure, is the
 * deliberate-scope lever), so no pricing enters here.
 */
export function estimateResearchPreview(
  documentCount: number,
  cap: number,
): ResearchPreview {
  const count = Math.max(0, documentCount);
  const segments = Math.max(1, Math.ceil(count / RESEARCH_SEGMENT_DOCS));
  return {
    documentCount: count,
    estMinutesLow: Math.max(1, Math.round(segments * MINUTES_PER_SEGMENT_LOW)),
    estMinutesHigh: Math.max(
      1,
      Math.round(segments * MINUTES_PER_SEGMENT_HIGH),
    ),
    overCap: count > cap,
    cap,
  };
}

// ---------------------------------------------------------------------------
// Over-limit messages — two DISTINCT conditions, never conflated
// ---------------------------------------------------------------------------
//
// A run can decline for two unrelated reasons, with different remedies:
//
//   * The DOCUMENT CAP (admin-adjustable in Policy & access): the scope holds
//     more readable documents than the workspace's per-run limit. The exact
//     count is known, the remedy is "narrow, or an admin raises the limit."
//   * The ENUMERATION BUDGET (a fixed technical limit, NOT the cap and NOT
//     adjustable): the folder tree is too large/deep to scan live in one
//     pass. No number, no "an admin can raise it" — the remedy is to narrow
//     or split the search.
//
// The engine sets a run's failure_reason from these builders, and the surface
// classifies a failure back to its kind (`classifyResearchFailure`) to attach
// the matching "why" without re-deriving the copy. The bounds reflect the
// real binding constraints (enumeration reachability, run time, findings
// usability), not storage — raising the cap needs no infrastructure change.

/** The document-cap decline message (exact count known at the engine; the
 * composer pre-empt passes its inventory estimate). */
export function docCapExceededMessage(
  documentCount: number,
  cap: number,
): string {
  return `This run would read ${documentCount} documents, more than this workspace's limit of ${cap} per run. Narrow your collections or question to bring it under, or an admin can raise the limit in Policy & access.`;
}

/** Why the per-run document limit exists (the short, in-flow explanation). */
export const RESEARCH_DOC_CAP_WHY =
  "Each document in a run is read closely, so a per-run limit keeps each run fast and focused and keeps its scope a deliberate choice. An administrator sets the limit for your workspace.";

/** The enumeration-budget decline message (fixed technical limit; no number,
 * no admin lever). */
export const RESEARCH_ENUMERATION_MESSAGE =
  "These folders are too large to scan in a single run. Try narrowing to fewer or smaller folders, or splitting your search across a few runs.";

/** Why the enumeration limit exists (the short, in-flow explanation). */
export const RESEARCH_ENUMERATION_WHY =
  "legalOS scans your folders live each time, so it is never working from a stale picture. Very large or deeply nested folder structures cannot be fully scanned in one pass, so narrowing helps it run reliably.";

export type ResearchFailureKind = "doc_cap" | "enumeration" | "other";

/**
 * Classify a run's failure_reason back to its kind, so the surface attaches
 * the correct "why" expander. Keys off the canonical openings the builders
 * above produce; co-located and unit-tested so the two can never drift.
 */
export function classifyResearchFailure(
  reason: string | null,
): ResearchFailureKind {
  if (!reason) return "other";
  if (reason.startsWith("This run would read")) return "doc_cap";
  if (reason.startsWith("These folders are too large to scan")) {
    return "enumeration";
  }
  return "other";
}
