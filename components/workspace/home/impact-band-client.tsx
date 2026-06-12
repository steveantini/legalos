"use client";

import Link from "next/link";
import { useState } from "react";

import type {
  ImpactBandData,
  SavingsCell,
  Timeframe,
  TimeframeData,
} from "@/lib/workspace/home/impact-math";

import { HelpLink } from "@/components/workspace/help-link";
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
 * section heading row pairs the "Impact" label on the left with the timeframe
 * toggle on the right, above the container. Inside the container the four stats
 * fill a 2x2 grid (with a hairline cross divider) flush at the container's top
 * edge, then a hairline rule, then the source/footer line pinned to the bottom
 * via mt-auto. The container's own top border is the band's top edge; with the
 * toggle on the heading row, the stats grid needs no inner top rule. Putting
 * the toggle on the heading row matches the pattern the Matters section uses
 * and reclaims the height the old in-container toggle row cost.
 * Agent runs and Top agent are measured from usage_events. Hours saved and
 * Estimated cost saved (calculator Step B) blend the user's measured run volume
 * with the org task book's estimated time/rate; they show live figures once an
 * admin configures the book, and an honest "Setup needed" cell until then.
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
      className="flex h-full flex-col gap-3.5"
    >
      <div className="flex h-9 items-center justify-between">
        <h2
          id="impact-band-heading"
          className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
        >
          Impact
        </h2>
        <div className="flex items-center gap-3">
          <HelpLink topic="impact" />
          <TimeframeToggle selected={selected} onChange={setSelected} />
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-xl border border-border bg-paper-2">
        <div className="grid grid-cols-2">
          <div className="border-b border-r border-hairline">
            {current.hoursSaved ? (
              <ImpactCell
                mode="value"
                label="Hours saved"
                value={formatHoursValue(current.hoursSaved.current)}
                suffix="hrs"
                delta={formatSavingsDelta(
                  current.hoursSaved,
                  current.comparisonLabel,
                  formatHoursMagnitude,
                )}
              />
            ) : (
              <ImpactCell
                mode="setup-needed"
                label="Hours saved"
                ctaHref={isAdmin ? "/workspace/admin/calculator" : undefined}
                ariaLabel="Set up hours saved tracking"
              />
            )}
          </div>
          <div className="border-b border-hairline">
            {current.costSaved ? (
              <ImpactCell
                mode="value"
                label="Estimated cost saved"
                value={formatCostValue(current.costSaved.current)}
                delta={formatSavingsDelta(
                  current.costSaved,
                  current.comparisonLabel,
                  formatCostMagnitude,
                )}
              />
            ) : (
              <ImpactCell
                mode="setup-needed"
                label="Estimated cost saved"
                ctaHref={isAdmin ? "/workspace/admin/calculator" : undefined}
                ariaLabel="Set up estimated cost saved tracking"
              />
            )}
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

        <div className="mt-auto flex items-baseline justify-between border-t border-hairline px-6 py-2.5">
          <span className="text-[12px] text-caption">
            {current.hoursSaved
              ? "Estimated from your usage and your team’s assumptions."
              : "Set up the task book to estimate savings."}
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

/**
 * Hours/cost saved are blended estimates (measured volume × estimated time/rate),
 * so they're shown with low precision befitting a motivational figure: hours get
 * one decimal under 10 and round above; cost is whole dollars.
 */
function formatHoursValue(n: number): string {
  if (n <= 0) return "0";
  return formatHoursMagnitude(n);
}

function formatHoursMagnitude(n: number): string {
  return n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString();
}

function formatCostValue(n: number): string {
  return `$${Math.round(Math.max(n, 0)).toLocaleString()}`;
}

function formatCostMagnitude(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Delta line for a savings cell, mirroring the Agent-runs delta: hidden for YTD
 * (no comparison) and when both windows are empty, so an idle user never sees a
 * forlorn "+0".
 */
function formatSavingsDelta(
  cell: SavingsCell,
  comparisonLabel: string | null,
  magnitude: (n: number) => string,
): string | undefined {
  if (comparisonLabel === null || cell.delta === null) return undefined;
  if (cell.current === 0 && (cell.previous ?? 0) === 0) return undefined;
  const sign = cell.delta >= 0 ? "+" : "-";
  return `${sign}${magnitude(Math.abs(cell.delta))} ${comparisonLabel}`;
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
