/**
 * Real-data projections for the adoption metrics surface, computed
 * from `AgentClickEvent`s logged to localStorage by
 * `lib/analytics/events.ts` (D-010 Phase 1 sink, preserved per D-020).
 *
 * Per D-021, real-mode views complete the original admin.html's
 * intended real-data path. Per Q1 of the Session 6 plan, user-
 * dependent surfaces (Top Users, Active/Repeat Users metric cards,
 * the User Detail Modal, the "User" column in the Agent Detail Modal)
 * return empty / null because `AgentClickEvent` does not currently
 * include user identity. Components render explicit "tracked in
 * Phase 2 when events move to Supabase" copy in those slots.
 *
 * Bucketing semantics mirror the sample-data semantics (week / month /
 * year periods). Real-mode bucketing is anchored to `Date.now()` —
 * real data should reflect the user's real "now," not the fixture's
 * SAMPLE_AS_OF.
 */

import type { AgentClickEvent } from "@/lib/analytics/events";

import type {
  ClicksRow,
  InteractionRow,
  MetricCardsData,
  Period,
  TopUserRow,
  UsageRow,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365 };

/**
 * Filter events to those within `period` of `Date.now()`. Events with
 * unparseable timestamps are silently dropped — defensive against
 * stored events from a future schema change.
 */
export function bucketEventsByPeriod(
  events: AgentClickEvent[],
  period: Period,
): AgentClickEvent[] {
  const cutoff = Date.now() - PERIOD_DAYS[period] * DAY_MS;
  return events.filter((e) => {
    const t = Date.parse(e.timestamp);
    return Number.isFinite(t) && t >= cutoff;
  });
}

/**
 * Aggregate clicks by agent name, sort descending. Returns one row per
 * unique agent in the bucket. Empty array when the bucket is empty;
 * components render the empty-state copy from there.
 */
export function realClicksPerAgent(
  events: AgentClickEvent[],
  period: Period,
): ClicksRow[] {
  const bucket = bucketEventsByPeriod(events, period);
  const counts = new Map<string, number>();
  for (const e of bucket) {
    counts.set(e.agentName, (counts.get(e.agentName) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Top users by interaction count. Always returns [] in real mode —
 * user identity is not tracked in localStorage events. Components
 * render "User identity is not currently tracked in localStorage events;
 * this becomes available in Phase 2 when events move to Supabase
 * (D-010)." when this returns empty.
 */
export function realTopUsers(): TopUserRow[] {
  return [];
}

/**
 * Per-agent usage rows for the Agent Detail Modal. Sorted newest-first.
 * The `user` field is "—" because user identity isn't tracked.
 */
export function realAgentDetails(
  events: AgentClickEvent[],
  agentName: string,
  period: Period,
): UsageRow[] {
  return bucketEventsByPeriod(events, period)
    .filter((e) => e.agentName === agentName)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .map((e) => ({
      date: formatDateForDisplay(e.timestamp),
      time: formatTimeForDisplay(e.timestamp),
      user: "—",
    }));
}

/**
 * Per-user interaction rows for the User Detail Modal. Always [] in
 * real mode for the same reason `realTopUsers` is empty. The User
 * Detail Modal is also not reachable in real mode in practice (Top
 * Users renders no clickable rows), but defensive behavior is correct.
 */
export function realUserDetails(): InteractionRow[] {
  return [];
}

/**
 * Metric-card values. Total Interactions is the lifetime event count
 * (matches the source's "Total Interactions" framing — cumulative, not
 * period-bounded). The four user-dependent cards return null and render
 * as "—". No trend pills in real mode (per the Session 6 plan's
 * Out-of-Scope list).
 */
export function realMetricCards(events: AgentClickEvent[]): MetricCardsData {
  return {
    totalInteractions: events.length,
    dailyActiveUsers: null,
    weeklyActiveUsers: null,
    dailyRepeatUsers: null,
    weeklyRepeatUsers: null,
    totalInteractionsTrend: null,
    dailyActiveUsersTrend: null,
    weeklyActiveUsersTrend: null,
    dailyRepeatUsersTrend: null,
    weeklyRepeatUsersTrend: null,
  };
}

function formatDateForDisplay(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatTimeForDisplay(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "—";
  let hour = d.getHours();
  const minute = String(d.getMinutes()).padStart(2, "0");
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${String(hour).padStart(2, "0")}:${minute} ${ampm}`;
}
