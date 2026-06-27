import type { StructuredQueryResult } from "@/lib/deterministic/structured-query";
import type { CollectionAttributeType } from "@/lib/knowledge/collection-schema";
import type { CollectionPreparationState } from "@/lib/knowledge/extraction/extract";

/**
 * Shared types for the Structured Query question surface (commit 5). Imported by
 * BOTH the server (the action + data layer) and the client (the composer, the
 * result view), so this module is deliberately free of "server-only" and holds
 * only types and small pure constants. The pure engine + IR live in
 * `lib/deterministic/structured-query`; this is the presentation contract on top.
 */

/** The minimum a member needs to ask about an attribute: its stable key, its
 * human label, its type (so the surface can hint what kinds of questions fit),
 * and any enum options. Deliberately NOT the admin's extraction `description`
 * (that is authoring detail); the query surface projects to this. */
export type QueryableAttribute = {
  key: string;
  label: string;
  type: CollectionAttributeType;
  options?: string[];
};

/** A collection a member can query, with the fields it tracks. */
export type QueryableCollection = {
  id: string;
  name: string;
  description: string;
  /** Always-visible source paths (the standing transparency rule). */
  provenance: string[];
  documentCount: number;
  lastSyncedAt: string | null;
  attributes: QueryableAttribute[];
  /** The preparation state, so the surface can flag a stale-data answer. */
  preparationState: CollectionPreparationState;
};

/**
 * A document KIND resolved for asking (Step 3b): the shared schema and the SET
 * of the viewer's visible folders that belong to it. Structured Query asks over
 * a kind, so an ask runs across every folder of the kind, not one folder. A
 * representative folder id is persisted with the saved question, so a re-run can
 * re-resolve the same kind over current data.
 */
export type QueryableKind = {
  schemaId: string;
  schemaName: string;
  attributes: QueryableAttribute[];
  /** Every visible folder belonging to this kind (the ask scope). */
  folderIds: string[];
  /** A stable folder id persisted with a saved question, so re-run re-resolves. */
  representativeCollectionId: string;
  documentCount: number;
  /** The kind-wide preparation state, for the answer's stale-data notice. */
  preparationState: CollectionPreparationState;
};

/** An existing kind an admin can point folders at, for the reuse-led setup
 * (Step 3b guided depth): its id, name, the fields it tracks, and how many
 * folders already belong to it. */
export type DocumentKindSummary = {
  schemaId: string;
  schemaName: string;
  fieldLabels: string[];
  folderCount: number;
};

/** One matched document with the supporting citation(s) that make the count
 * CHECKABLE: the value the engine matched on plus the verbatim quote behind it,
 * and whether that quote was verified against the source (commit 3). */
export type MatchedDocument = {
  documentId: string;
  title: string;
  values: ReadonlyArray<{
    label: string;
    /** The human-readable extracted value. */
    value: string;
    /** The verbatim supporting quote (empty when none was stored). */
    excerpt: string;
    /** Whether the quote was verified as a real substring of the source. */
    verified: boolean;
  }>;
};

/** The presented answer the surface renders: the exact count leads, the
 * interpreted query is shown, the engine's honesty caveats ride one layer down,
 * and a sample of matched documents carries citations for verification. */
export type PresentedAnswer = {
  kind: "answer";
  /** The persisted row id, so the result can be re-run / deleted. */
  id: string;
  question: string;
  /** The interpreted query in plain language (the transparency bridge). */
  interpretedSummary: string;
  /** The full engine result (counts, groups, caveats) — the exact answer. */
  result: StructuredQueryResult;
  /** A capped sample of matched documents with citations (for verification). */
  matches: MatchedDocument[];
  /** How many matched documents are shown vs. how many matched in total. */
  shownMatches: number;
  totalMatches: number;
  /** The collection's preparation state, for the stale-data notice. */
  preparationState: CollectionPreparationState;
};

/**
 * The honest GAP: the question referenced something the collection's schema
 * does not track. We name what IS available so the user knows what they can
 * ask. PHASE-TWO SEAM: this is the exact moment that becomes "want me to start
 * tracking <missingConcept>?" (schema-grows-on-demand) — adding that offer is
 * additive to this shape (a new optional field + a button), never a rewrite.
 */
export type PresentedGap = {
  kind: "gap";
  id: string;
  question: string;
  /** The unmapped concept the question asked about. */
  missingConcept: string;
  /** What the collection DOES track, so the user can re-ask. */
  availableAttributes: QueryableAttribute[];
};

export type PresentedResult = PresentedAnswer | PresentedGap;

/** A recent asked question, for the history list (re-runnable, auditable). */
export type StructuredQueryHistoryItem = {
  id: string;
  question: string;
  interpretedSummary: string;
  understood: boolean;
  matchedCount: number | null;
  totalCount: number | null;
  collectionId: string;
  collectionName: string;
  createdAt: string;
};

/** Question length bounds, shared by the composer and the server validator so
 * the two can never disagree. */
export const QUESTION_MIN_LENGTH = 8;
export const QUESTION_MAX_LENGTH = 400;
/** How many matched documents the answer shows with citations (the rest are
 * counted, not listed — surfaced honestly as "showing N of M"). */
export const MAX_SHOWN_MATCHES = 50;
