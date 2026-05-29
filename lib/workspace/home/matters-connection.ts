/**
 * Matters connection gate, typed shapes, and data sources for the workspace
 * home "Matters" section.
 *
 * `isMattersConnected` now reads real connection state from the database (the
 * connection data model, migration 0044) via `hasActiveConnectionInCategory`.
 * It returns false today only because no connections exist yet; it is reading
 * live state. `getMatters` / `getMattersSummary` stay stubs: they will fetch
 * from the connected CLM's API once a connection exists and the provider
 * adapter is built (a later milestone).
 *
 * Server-only (it transitively imports the Supabase server client). Client
 * components must import only the *types* from this module (type imports are
 * erased), never its runtime values, which is why the matter stage order lives
 * in the client component that renders it rather than being exported here.
 */

import { hasActiveConnectionInCategory } from "@/lib/settings/connections";

/**
 * The lifecycle stages a matter/deal moves through, in order. The connected
 * view's progress indicator fills dots up to and including the current stage.
 * The screenshot shows DRAFT, REVIEW, NEGOTIATION, and SIGN-OFF as stage
 * labels; "closed" is the terminal stage. This five-stage order is the
 * reasonable interpretation of that set.
 */
export type MatterStage =
  | "draft"
  | "review"
  | "negotiation"
  | "sign-off"
  | "closed";

/** Mine / Team / All scope for the connected view's segmented toggle. */
export type MattersScope = "mine" | "team" | "all";

/** One matter/deal row in the connected view. */
export type Matter = {
  id: string;
  /** Short type tag shown as a dark pill, e.g. "MPA", "NDA", "DPA". */
  typeBadge: string;
  /** Matter name, e.g. "Red Hat — Master Purchase Agreement v4". */
  name: string;
  /** Counterparty, e.g. "Red Hat, Inc.". */
  counterparty: string;
  /** Current lifecycle stage; drives the progress indicator. */
  stage: MatterStage;
  /** Due label, e.g. "Sat · Jun 1"; null when there is no due date. */
  dueLabel: string | null;
  /** Deal value, e.g. "$2.4M ARR" or "$580K"; null when not applicable. */
  value: string | null;
  /** Whether the matter has unseen activity (the dot beside its name). */
  hasActivity: boolean;
};

/** Aggregate stats shown in the connected view's four-stat row. */
export type MattersSummary = {
  /** Active matters in scope. */
  activeCount: number;
  /** Signed change vs last week; null when there is no comparison window. */
  activeDelta: number | null;
  /** Matters closing this month. */
  closingThisMonth: number;
  /** Of those closing, how many are on track. */
  closingOnTrack: number;
  /** Of those closing, how many are at risk. */
  closingAtRisk: number;
  /** Matters awaiting the user's review. */
  awaitingReview: number;
  /** Breakdown line for awaiting review, e.g. "2 redlines · 1 sign-off". */
  awaitingDetail: string;
  /** Total value in flight, e.g. "$14.6M". */
  valueInFlight: string;
  /** How many active matters that value spans, e.g. 12. */
  valueAcrossCount: number;
};

/** Per-scope payload the connected view toggles between. */
export type ScopedMatters = {
  summary: MattersSummary | null;
  matters: Matter[];
};

/**
 * Whether `userId` has an active connection in the matter-management capability
 * category that they can use. Reads real connection state (returns false today
 * because no connections exist yet).
 */
export async function isMattersConnected(userId: string): Promise<boolean> {
  return hasActiveConnectionInCategory(userId, "matter-management");
}

/**
 * Aggregate matter stats for `userId` in the given `scope`, for the four-stat
 * row. Returns null for now (no connection). When the CLM integration ships,
 * this reads the connected provider's aggregates for the scope.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- production signature; body reads the connected CLM once integration ships.
export async function getMattersSummary(userId: string, scope: MattersScope): Promise<MattersSummary | null> {
  return null;
}

/**
 * Matters for `userId` in the given `scope`, for the connected view's rows.
 * Returns an empty array for now (no connection). When the CLM integration
 * ships, this reads and normalizes the provider's matters for the scope.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- production signature; body reads the connected CLM once integration ships.
export async function getMatters(userId: string, scope: MattersScope): Promise<Matter[]> {
  return [];
}
