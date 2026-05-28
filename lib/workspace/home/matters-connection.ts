/**
 * Matters connection gate, typed shapes, and data sources for the workspace
 * home "Matters" section.
 *
 * Every function carries its final production signature so the call sites are
 * stable; only the bodies change when CLM / matter-management integration
 * ships under the Share and connector hub arc (roadmap item 2). Until then no
 * provider can be connected, so the gate stays closed and there is nothing to
 * fetch — the Matters section shows its "Connect your matter management"
 * placeholder for every user.
 */

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

/** Canonical stage order, oldest to newest, for the progress indicator. */
export const MATTER_STAGES: MatterStage[] = [
  "draft",
  "review",
  "negotiation",
  "sign-off",
  "closed",
];

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
 * Whether `userId` has a connected CLM / matter-management provider.
 *
 * Returns false until that integration ships under the Share and connector hub
 * arc (roadmap item 2). When it lands, this queries the integrations table for
 * a matter-management provider row owned by the user. The signature is the
 * final production signature; only the body changes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `userId` is the final signature; unused only while the body is the closed-gate stub.
export async function isMattersConnected(userId: string): Promise<boolean> {
  return false;
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
