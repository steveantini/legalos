import type { MetricCardsData } from "@/lib/metrics/types";

import { MetricCard } from "./metric-card";

interface MetricCardsGridProps {
  data: MetricCardsData;
}

/**
 * Five-card grid mirroring the source's <div class="metrics-grid">
 * (admin.html lines 940–966): Total Interactions, Daily Active Users,
 * Weekly Active Users, Daily Repeat Users, Weekly Repeat Users.
 *
 * In real mode, the four user-dependent cards display "—" (per Q1 of
 * the Session 6 plan and D-021 — `AgentClickEvent` does not currently
 * include user identity). Total Interactions is always populated.
 */
export function MetricCardsGrid({ data }: MetricCardsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <MetricCard
        label="Total Interactions"
        value={data.totalInteractions}
        trend={data.totalInteractionsTrend}
      />
      <MetricCard
        label="Daily Active Users"
        value={data.dailyActiveUsers}
        trend={data.dailyActiveUsersTrend}
      />
      <MetricCard
        label="Weekly Active Users"
        value={data.weeklyActiveUsers}
        trend={data.weeklyActiveUsersTrend}
      />
      <MetricCard
        label="Daily Repeat Users"
        value={data.dailyRepeatUsers}
        trend={data.dailyRepeatUsersTrend}
      />
      <MetricCard
        label="Weekly Repeat Users"
        value={data.weeklyRepeatUsers}
        trend={data.weeklyRepeatUsersTrend}
      />
    </div>
  );
}
