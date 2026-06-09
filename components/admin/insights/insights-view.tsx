"use client";

import Link from "next/link";
import { useState } from "react";

import type { MetricValue } from "@/components/metrics/format";
import { MetricStatRow, type StatItem } from "@/components/metrics/metric-stat-row";
import { MetricTable } from "@/components/metrics/metric-table";
import { MetricTile } from "@/components/metrics/metric-tile";
import type { MetricColumn } from "@/components/metrics/types";
import { Switch } from "@/components/ui/switch";
import type {
  InsightsData,
  InsightsTimeframe,
  InsightsWindow,
} from "@/lib/workspace/admin/insights/insights-math";
import { SAMPLE_INSIGHTS } from "@/lib/workspace/admin/insights/sample-data";

const TIMEFRAME_OPTIONS: { value: InsightsTimeframe; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "ytd", label: "YTD" },
];

const BREAKDOWNS: {
  title: string;
  key: "byAgent" | "byDepartment" | "byUser";
  dimension: string;
  empty: string;
}[] = [
  { title: "By agent", key: "byAgent", dimension: "Agent", empty: "No agent runs in this window." },
  { title: "By department", key: "byDepartment", dimension: "Department", empty: "No department activity in this window." },
  { title: "By person", key: "byUser", dimension: "Person", empty: "No people active in this window." },
];

function breakdownColumns(dimension: string): MetricColumn[] {
  return [
    { key: "label", label: dimension, format: "text", align: "start" },
    { key: "runs", label: "Runs", format: "int", align: "end" },
  ];
}

/**
 * Insights (A4a), re-rendered through the shared metric primitives and reframed
 * to lead with adoption and engagement (calculator Step / presentation
 * unification). Same RLS-scoped data and the SAME numbers as before — only the
 * rendering changed: the headline scalars go through MetricStatRow and the
 * breakdowns through MetricTable, so Insights reads as one family with the home
 * Impact card and the platform analytics one altitude up.
 *
 * Adoption/engagement leads: active people, the agent-runs trend, and the
 * adoption gap (agents never run). The by-model breakdown is intentionally
 * dropped here — model (and cost) live at the platform tier; org-level Insights
 * leads with adoption. Cost stays withheld at this altitude (pending the business
 * model). The timeframe toggle, the demo sample-data toggle, and the calm
 * "No usage yet" zero-state are preserved, and a link points to the Productivity
 * Calculator for the value/ROI story.
 */
export function InsightsView({ real }: { real: InsightsData }) {
  const [timeframe, setTimeframe] = useState<InsightsTimeframe>("month");
  const [sampleOn, setSampleOn] = useState(false);

  const data = sampleOn ? SAMPLE_INSIGHTS : real;
  const window = data[timeframe];

  // Honest zero-state: real data, no measured usage all year.
  const isEmpty = !sampleOn && real.ytd.runs.current === 0;

  const leadStats: StatItem[] = [
    { label: "Active people", value: window.activeUsers, format: "int" },
    {
      label: "Agent runs",
      value: window.runs.current,
      format: "int",
      hint: formatDelta(window) ?? undefined,
    },
    { label: "Agents", value: data.agents.total, format: "int" },
    {
      label: "Not yet used",
      value: data.agents.unused,
      format: "int",
      hint: data.agents.total > 0 ? `of ${data.agents.total.toLocaleString("en-US")}` : undefined,
    },
  ];

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TimeframeToggle selected={timeframe} onChange={setTimeframe} />
          {sampleOn ? (
            <span className="rounded-full border border-hairline-strong bg-paper-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-caption">
              Sample data
            </span>
          ) : null}
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted-foreground">
          <span>Sample data</span>
          <Switch
            checked={sampleOn}
            onCheckedChange={setSampleOn}
            aria-label="Show sample data for a demo"
          />
        </label>
      </div>

      {isEmpty ? (
        <ZeroState agentsTotal={real.agents.total} />
      ) : (
        <div className="mt-8 flex flex-col gap-12">
          <MetricTile title="Adoption and engagement">
            <MetricStatRow stats={leadStats} />
          </MetricTile>

          <div className="grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-2">
            {BREAKDOWNS.map((b) => (
              <MetricTile key={b.key} title={b.title} headingLevel="h3">
                <MetricTable
                  columns={breakdownColumns(b.dimension)}
                  rows={window[b.key] as unknown as Record<string, MetricValue>[]}
                  emptyLabel={b.empty}
                />
              </MetricTile>
            ))}
          </div>

          <p className="text-[13px] text-muted-foreground">
            Looking for the value in dollars?{" "}
            <Link
              href="/workspace/admin/calculator"
              className="font-medium text-primary hover:underline"
            >
              Estimate it in the Productivity Calculator ↗
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

/** Calm empty state when there's no measured usage yet (real data, toggle off). */
function ZeroState({ agentsTotal }: { agentsTotal: number }) {
  return (
    <div className="mt-8 rounded-lg bg-paper-2 px-6 py-12 text-center">
      <p className="text-[15px] font-medium text-foreground">No usage yet</p>
      <p className="mx-auto mt-2 max-w-[48ch] text-[13px] leading-[1.5] text-muted-foreground">
        {agentsTotal > 0
          ? "Once your team starts running agents, their activity shows up here, broken down by agent, department, and person."
          : "Once agents are created and your team starts using them, their activity shows up here."}{" "}
        Turn on Sample data above to preview what this looks like.
      </p>
    </div>
  );
}

/** Segmented Week / Month / YTD control (toggle-button group, not tabs). */
function TimeframeToggle({
  selected,
  onChange,
}: {
  selected: InsightsTimeframe;
  onChange: (value: InsightsTimeframe) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Insights timeframe"
      className="inline-flex items-center rounded-full border border-border bg-card p-0.5"
    >
      {TIMEFRAME_OPTIONS.map((option) => {
        const isSelected = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isSelected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Delta line for the Agent-runs stat, e.g. "+56 vs April". Hidden for YTD (no
 * comparison) and when both windows are empty, so a brand-new or idle org never
 * sees a forlorn "+0 vs last week". Same logic and value as before.
 */
function formatDelta(window: InsightsWindow): string | null {
  const { runs } = window;
  if (runs.comparisonLabel === null || runs.delta === null) return null;
  if (runs.current === 0 && (runs.previous ?? 0) === 0) return null;
  const sign = runs.delta >= 0 ? "+" : "";
  return `${sign}${runs.delta.toLocaleString("en-US")} ${runs.comparisonLabel}`;
}
