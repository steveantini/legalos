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

/**
 * Trend pill on a metric card. Sample mode uses hardcoded values from
 * the source (lines 941–965). Real mode renders no trend pill — set to
 * null. The `compare` string is the period anchor copy ("this week",
 * "vs yesterday", "vs last week").
 */
export interface TrendPill {
  direction: "up" | "down";
  pct: number;
  compare: string;
}

/**
 * The 5-card grid at the top of the metrics surface. Total Interactions
 * is always computable; the four user-dependent cards (Daily/Weekly
 * Active/Repeat Users) are null in real mode because `AgentClickEvent`
 * does not currently include user identity (Q1 of the Session 6 plan,
 * D-020). Components render "—" for null values.
 *
 * Trend pills are null in real mode (no period-over-period baseline
 * stored in localStorage). Sample mode populates all five.
 */
export interface MetricCardsData {
  totalInteractions: number;
  dailyActiveUsers: number | null;
  weeklyActiveUsers: number | null;
  dailyRepeatUsers: number | null;
  weeklyRepeatUsers: number | null;
  totalInteractionsTrend: TrendPill | null;
  dailyActiveUsersTrend: TrendPill | null;
  weeklyActiveUsersTrend: TrendPill | null;
  dailyRepeatUsersTrend: TrendPill | null;
  weeklyRepeatUsersTrend: TrendPill | null;
}
