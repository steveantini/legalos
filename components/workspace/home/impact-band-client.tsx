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
 * Composition reads as a single bounded card that fills its grid column: the
 * section heading "Impact" sits above the container as a pure label; inside
 * the container the timeframe toggle sits flush at the top-right, then a
 * hairline rule, the four stats in a 2x2 grid (with a hairline cross divider),
 * another hairline rule, and the source/footer line pinned to the bottom via
 * mt-auto. The container's own top border is the band's top edge — there is no
 * inner top rule to double it up.
 * Two cells (Agent runs, Top agent) show real data; two (Hours saved,
 * Estimated cost saved) stay "Setup needed" until the calculator's task book
 * is promoted to the database (separate sub-arc).
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
      className="flex h-full flex-col gap-4"
    >
      <h2
        id="impact-band-heading"
        className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
      >
        Impact
      </h2>

      <div className="flex flex-1 flex-col rounded-xl border border-border bg-paper-2">
        <div className="flex items-center justify-end px-6 py-3">
          <TimeframeToggle selected={selected} onChange={setSelected} />
        </div>

        <div className="grid grid-cols-2 border-t border-hairline">
          <div className="border-b border-r border-hairline">
            <ImpactCell
              mode="setup-needed"
              label="Hours saved"
              ctaHref={isAdmin ? "/workspace/admin/calculator" : undefined}
              ariaLabel="Set up hours saved tracking"
            />
          </div>
          <div className="border-b border-hairline">
            <ImpactCell
              mode="setup-needed"
              label="Estimated cost saved"
              ctaHref={isAdmin ? "/workspace/admin/calculator" : undefined}
              ariaLabel="Set up estimated cost saved tracking"
            />
          </div>
          <div className="border-r border-hairline">
            <ImpactCell
              mode="value"
              label="Agent runs"
              value={String(current.agentRuns.current)}
              delta={runsDelta}
            />
          </div>
          <div>
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

        <div className="mt-auto flex items-baseline justify-between border-t border-hairline px-6 py-3">
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
