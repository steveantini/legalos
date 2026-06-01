"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Sparkline } from "@/components/workspace/home/sparkline";
import type {
  InsightsBreakdownRow,
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

const TIMEFRAME_NOUN: Record<InsightsTimeframe, string> = {
  week: "this week",
  month: "this month",
  ytd: "year to date",
};

/**
 * The Insights usage/adoption lens (A4a). All numbers are MEASURED native-agent
 * activity from usage_events (cost is out of scope until A4b). Holds the
 * timeframe and the demo sample-data toggle in client state; both real and
 * sample datasets are in memory (real fetched server-side, sample an in-code
 * fixture), so switching either is instant with no fetch — the home impact-band
 * pattern. There is therefore no client round-trip to skeleton: the page arrives
 * fully rendered and toggles swap in place.
 *
 * When the sample toggle is on, a visible "Sample data" badge sits beside the
 * controls so illustrative numbers are never mistaken for real ones.
 */
export function InsightsView({ real }: { real: InsightsData }) {
  const [timeframe, setTimeframe] = useState<InsightsTimeframe>("month");
  const [sampleOn, setSampleOn] = useState(false);

  const data = sampleOn ? SAMPLE_INSIGHTS : real;
  const window = data[timeframe];

  // Honest zero-state: real data, no measured usage all year. The controls stay
  // visible so an admin can flip on Sample data to preview the experience.
  const isEmpty = !sampleOn && real.ytd.runs.current === 0;

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
          <Headline window={window} timeframe={timeframe} agents={data.agents} />

          <div className="grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2">
            <BarList
              title="By agent"
              rows={window.byAgent}
              emptyLabel="No agent runs in this window."
            />
            <BarList
              title="By department"
              rows={window.byDepartment}
              emptyLabel="No department activity in this window."
            />
            <BarList
              title="By model"
              rows={window.byModel}
              emptyLabel="No model usage in this window."
            />
            <BarList
              title="By person"
              rows={window.byUser}
              emptyLabel="No people active in this window."
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Headline: agent runs for the window + trend + sparkline + adoption summary. */
function Headline({
  window,
  timeframe,
  agents,
}: {
  window: InsightsWindow;
  timeframe: InsightsTimeframe;
  agents: InsightsData["agents"];
}) {
  const { runs, activeUsers } = window;
  const delta = formatDelta(window);

  return (
    <section className="flex flex-wrap items-end justify-between gap-8">
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">
          Agent runs {TIMEFRAME_NOUN[timeframe]}
        </p>
        <div className="mt-1 flex items-end gap-3">
          <span className="text-[44px] font-normal leading-none tracking-[-0.03em] text-foreground tabular-nums">
            {runs.current.toLocaleString("en-US")}
          </span>
          {delta ? (
            <span
              className={`pb-1 text-[13px] font-medium tabular-nums ${
                runs.delta !== null && runs.delta < 0
                  ? "text-muted-foreground"
                  : "text-primary"
              }`}
            >
              {delta}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-[13px] leading-[1.5] text-caption">
          {activeUsers.toLocaleString("en-US")}{" "}
          {activeUsers === 1 ? "person" : "people"} active {TIMEFRAME_NOUN[timeframe]} ·{" "}
          {agents.total.toLocaleString("en-US")}{" "}
          {agents.total === 1 ? "agent" : "agents"}
          {agents.unused > 0
            ? `, ${agents.unused.toLocaleString("en-US")} not yet used`
            : ""}
        </p>
      </div>

      <div className="pb-1">
        <Sparkline values={runs.sparkline} width={160} height={40} />
      </div>
    </section>
  );
}

/** A labeled horizontal-bar breakdown (top rows for one dimension). */
function BarList({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: InsightsBreakdownRow[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.runs));

  return (
    <section aria-labelledby={`insights-${slug(title)}`}>
      <h2
        id={`insights-${slug(title)}`}
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] leading-[1.5] text-caption">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] text-foreground">
                  {row.label}
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                  {row.runs.toLocaleString("en-US")}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-2"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-chat-cite-bg"
                  style={{ width: `${Math.max(2, (row.runs / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Calm empty state when there's no measured usage yet (real data, toggle off). */
function ZeroState({ agentsTotal }: { agentsTotal: number }) {
  return (
    <div className="mt-8 rounded-lg bg-paper-2 px-6 py-12 text-center">
      <p className="text-[15px] font-medium text-foreground">No usage yet</p>
      <p className="mx-auto mt-2 max-w-[48ch] text-[13px] leading-[1.5] text-muted-foreground">
        {agentsTotal > 0
          ? "Once your team starts running agents, their activity shows up here, broken down by agent, department, model, and person."
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
 * Delta line for the headline, e.g. "+56 vs April". Hidden for YTD (no
 * comparison window) and when both windows are empty, so a brand-new or idle
 * org never sees a forlorn "+0 vs last week".
 */
function formatDelta(window: InsightsWindow): string | null {
  const { runs } = window;
  if (runs.comparisonLabel === null || runs.delta === null) return null;
  if (runs.current === 0 && (runs.previous ?? 0) === 0) return null;
  const sign = runs.delta >= 0 ? "+" : "";
  return `${sign}${runs.delta.toLocaleString("en-US")} ${runs.comparisonLabel}`;
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z]+/g, "-");
}
