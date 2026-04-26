/**
 * Shared types for the adoption metrics surface. Used by both the
 * sample-data fixtures (`./sample-data.ts`) and the real-data
 * helpers (`./real-data.ts`, lands in step 4) so a single set of
 * components renders either source unchanged.
 *
 * Field names match the source's sample-data shapes verbatim:
 * - `TopUserRow.agent` (not `mostUsedAgent`) — matches the source's
 *   `topUsersData` rows; the original's API path uses `mostUsedAgent`
 *   but the API was never connected (D-021).
 * - `InteractionRow` / `UsageRow` use `{date, time, agent|user}`
 *   matching the source's modal table columns.
 */

export type Period = "week" | "month" | "year";

export interface TopUserRow {
  rank: number;
  user: string;
  interactions: number;
  /** Most-used agent name. */
  agent: string;
}

export interface ClicksRow {
  /** Agent name. */
  label: string;
  value: number;
}

export interface InteractionRow {
  /** YYYY-MM-DD. */
  date: string;
  /** HH:MM AM/PM. */
  time: string;
  agent: string;
}

export interface UsageRow {
  date: string;
  time: string;
  user: string;
}
