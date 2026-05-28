"use client";

import Link from "next/link";
import { useState } from "react";

import type {
  ImpactBandData,
  Timeframe,
  TimeframeData,
} from "@/lib/workspace/home/impact-math";

import { ImpactCell } from "./impact-cell";
import { TimeframeToggle } from "./timeframe-toggle";

type ImpactBandClientProps = {
  data: ImpactBandData;
  /** Gates the calculator CTAs, which route to an admin-only page. */
  isAdmin: boolean;
};

/**
 * Client half of the impact band. Holds the selected timeframe in state and
 * swaps which pre-fetched dataset renders — all three (week / month / ytd)
 * arrive from the server in `data`, so toggling is instant with no fetch and
 * no loading state.
 *
 * Composition reads as a single bounded newspaper section: the heading + the
 * timeframe toggle on one row, then the four stats bounded above and below by
 * hairline rules, then the source/footer line inside the same container under
 * the bottom rule. Two cells (Agent runs, Top agent) show real data; two
 * (Hours saved, Estimated cost saved) stay "Setup needed" until the
 * calculator's task book is promoted to the database (separate sub-arc).
 *
 * Default timeframe is Week on every load; persisting the last choice is a v2
 * concern.
 */
export function ImpactBandClient({ data, isAdmin }: ImpactBandClientProps) {
  const [selected, setSelected] = useState<Timeframe>("week");
  const current = data[selected];
  const runsDelta = formatRunsDelta(current);

  return (
    <section
      aria-labelledby="impact-band-heading"
      className="flex flex-col gap-5"
    >
      <div className="flex items-center justify-between">
        <h2
          id="impact-band-heading"
          className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
        >
          Impact
        </h2>
        <TimeframeToggle selected={selected} onChange={setSelected} />
      </div>

      <div className="rounded-xl border border-border bg-paper-2 p-1">
        <div className="border-t border-hairline">
          <div className="grid grid-cols-4 divide-x divide-hairline">
            <ImpactCell
              mode="setup-needed"
              label="Hours saved"
              ctaHref={isAdmin ? "/workspace/admin/calculator" : undefined}
              ariaLabel="Set up hours saved tracking"
            />
            <ImpactCell
              mode="setup-needed"
              label="Estimated cost saved"
              ctaHref={isAdmin ? "/workspace/admin/calculator" : undefined}
              ariaLabel="Set up estimated cost saved tracking"
            />
            <ImpactCell
              mode="value"
              label="Agent runs"
              value={String(current.agentRuns.current)}
              delta={runsDelta}
              sparkline={current.agentRuns.sparkline}
            />
            <ImpactCell
              mode="text"
              label="Top agent"
              primary={current.topAgent.name ?? "—"}
              secondary={
                current.topAgent.name
                  ? `${current.topAgent.runsCurrent} runs ${timeframeNoun(selected)}`
                  : `No runs yet ${timeframeNoun(selected)}`
              }
            />
          </div>
        </div>

        <div className="border-t border-hairline">
          <div className="flex items-baseline justify-between px-6 py-4">
            <span className="text-[12px] text-caption">
              Calculated from your role’s task book.
            </span>
            {isAdmin && (
              <Link
                href="/workspace/admin/calculator"
                className="text-[12px] text-primary hover:underline"
              >
                How this is calculated ↗
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Delta line for Agent runs, scoped to the selected timeframe's comparison
 * label ("+12 vs last week", "-3 vs April"). Hidden when the timeframe has no
 * comparison window (YTD) and when both windows are empty, so a brand-new or
 * idle user never sees a forlorn "+0 vs last week".
 */
function formatRunsDelta(timeframe: TimeframeData): string | undefined {
  const { agentRuns, comparisonLabel } = timeframe;
  if (comparisonLabel === null || agentRuns.delta === null) return undefined;
  if (agentRuns.current === 0 && (agentRuns.previous ?? 0) === 0) {
    return undefined;
  }
  const sign = agentRuns.delta >= 0 ? "+" : "";
  return `${sign}${agentRuns.delta} ${comparisonLabel}`;
}

/** Trailing noun for the Top-agent secondary line, per timeframe. */
function timeframeNoun(timeframe: Timeframe): string {
  switch (timeframe) {
    case "week":
      return "this week";
    case "month":
      return "this month";
    case "ytd":
      return "year to date";
  }
}
