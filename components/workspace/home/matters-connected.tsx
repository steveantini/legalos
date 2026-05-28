"use client";

import { useState } from "react";

import {
  MATTER_STAGES,
  type Matter,
  type MatterStage,
  type MattersScope,
  type MattersSummary,
  type ScopedMatters,
} from "@/lib/workspace/home/matters-connection";

/** Matter rows beyond this count collapse behind the "View all" footer link. */
const VISIBLE_LIMIT = 5;

const SCOPE_OPTIONS: { value: MattersScope; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "team", label: "Team" },
  { value: "all", label: "All" },
];

type MattersConnectedProps = {
  /** All scopes pre-fetched server-side so the toggle swaps with no round-trip. */
  scopedData: Record<MattersScope, ScopedMatters>;
  /** CLM display name for the sync line and "Open in" link. */
  clmName: string;
};

/**
 * Connected-state interior of the Matters section: a four-stat row, a list of
 * matter rows with type badges and stage-progress indicators, and a footer —
 * matching the Claude Design Matters format. Owns the Mine/Team/All scope state
 * (mirrors the impact band's client toggle) and renders whichever pre-fetched
 * scope is selected.
 *
 * Dormant for now: the Matters section only mounts this when isMattersConnected
 * is true, which never happens until CLM integration ships (Share and connector
 * hub arc, roadmap item 2). Built and ready so the surface lights up the moment
 * a real matter-management tool connects.
 *
 * Returns the heading row and the card as siblings so the parent section's
 * gap-3.5 spaces them, the same way the placeholder branch is composed.
 */
export function MattersConnected({ scopedData, clmName }: MattersConnectedProps) {
  const [scope, setScope] = useState<MattersScope>("mine");
  const { summary, matters } = scopedData[scope];
  const visible = matters.slice(0, VISIBLE_LIMIT);
  const totalActive = summary?.activeCount ?? matters.length;

  return (
    <>
      <div className="flex h-9 items-center justify-between">
        <h2
          id="matters-section-heading"
          className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
        >
          Matters
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-caption">
            Synced from {clmName}
          </span>
          <ScopeToggle selected={scope} onChange={setScope} />
        </div>
      </div>

      <div className="flex flex-col rounded-xl border border-border bg-card">
        {summary ? <StatRow summary={summary} /> : null}

        {matters.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No active matters right now.
          </p>
        ) : (
          <>
            <ul>
              {visible.map((matter) => (
                <MatterRow key={matter.id} matter={matter} />
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
              <span className="text-[12px] text-caption">
                Showing {visible.length} of {totalActive} {scopeNoun(scope)}
              </span>
              <div className="flex items-center gap-4">
                {/* Become real links (internal matters page, external CLM deep
                    link) when the connector hub ships; no destinations yet. */}
                <span className="text-[12px] font-medium text-primary">
                  View all matters →
                </span>
                <span className="text-[12px] font-medium text-primary">
                  Open in {clmName} ↗
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Four-stat row, bounded below by a hairline rule like the impact band. */
function StatRow({ summary }: { summary: MattersSummary }) {
  return (
    <div className="grid grid-cols-4 border-b border-hairline">
      <StatCell
        label="Active matters"
        value={String(summary.activeCount)}
        detail={formatActiveDelta(summary.activeDelta)}
        accentDetail
      />
      <StatCell
        label="Closing this month"
        value={String(summary.closingThisMonth)}
        detail={`${summary.closingOnTrack} on track · ${summary.closingAtRisk} at risk`}
      />
      <StatCell
        label="Awaiting your review"
        value={String(summary.awaitingReview)}
        detail={summary.awaitingDetail}
      />
      <StatCell
        label="Value in flight"
        value={summary.valueInFlight}
        detail={`across ${summary.valueAcrossCount} active`}
        divider={false}
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  detail,
  accentDetail = false,
  divider = true,
}: {
  label: string;
  value: string;
  detail: string;
  accentDetail?: boolean;
  divider?: boolean;
}) {
  return (
    <div className={`px-5 py-4 ${divider ? "border-r border-hairline" : ""}`}>
      <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-caption">
        {label}
      </p>
      <p className="mb-1 text-[28px] font-normal leading-none tracking-[-0.025em] tabular-nums text-foreground">
        {value}
      </p>
      {detail ? (
        <p
          className={`text-[11.5px] ${accentDetail ? "font-medium text-primary" : "text-caption"}`}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function MatterRow({ matter }: { matter: Matter }) {
  return (
    <li className="flex items-center gap-4 border-t border-hairline px-5 py-3.5 first:border-t-0">
      <span className="shrink-0 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-background">
        {matter.typeBadge}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[14px] font-medium text-foreground">
            {matter.name}
          </p>
          {matter.hasActivity ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <p className="truncate text-[12px] text-caption">{matter.counterparty}</p>
      </div>
      <div className="shrink-0">
        <StageProgress stage={matter.stage} />
      </div>
      <span className="w-24 shrink-0 text-right text-[12px] text-muted-foreground">
        {matter.dueLabel ?? "No due date"}
      </span>
      <span className="w-20 shrink-0 text-right text-[13px] tabular-nums text-foreground">
        {matter.value ?? "—"}
      </span>
      <span className="shrink-0 text-caption" aria-hidden="true">
        →
      </span>
    </li>
  );
}

/**
 * Horizontal dot indicator: stages up to and including the current one are
 * filled (foreground), later stages muted (hairline), with the current stage
 * named below in a mono caption.
 */
function StageProgress({ stage }: { stage: MatterStage }) {
  const currentIndex = MATTER_STAGES.indexOf(stage);
  const label = formatStage(stage);
  return (
    <div
      className="flex flex-col items-center gap-1"
      role="img"
      aria-label={`Stage: ${label}`}
    >
      <div className="flex items-center gap-1">
        {MATTER_STAGES.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 w-1.5 rounded-full ${i <= currentIndex ? "bg-foreground" : "bg-hairline"}`}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-caption">
        {label}
      </span>
    </div>
  );
}

/** Segmented Mine/Team/All control, mirroring the impact band's timeframe toggle. */
function ScopeToggle({
  selected,
  onChange,
}: {
  selected: MattersScope;
  onChange: (scope: MattersScope) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Matters scope"
      className="inline-flex items-center rounded-full border border-border bg-card p-0.5"
    >
      {SCOPE_OPTIONS.map((option) => {
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

/** "↑ 2 vs last week" / "↓ 1 vs last week"; empty string when no comparison. */
function formatActiveDelta(delta: number | null): string {
  if (delta === null) return "";
  const arrow = delta >= 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(delta)} vs last week`;
}

/** Stage union member to its display label, e.g. "sign-off" → "SIGN-OFF". */
function formatStage(stage: MatterStage): string {
  return stage.toUpperCase();
}

/** Footer noun, scoped: who the shown matters belong to. */
function scopeNoun(scope: MattersScope): string {
  switch (scope) {
    case "mine":
      return "active matters assigned to you";
    case "team":
      return "active matters assigned to your team";
    case "all":
      return "active matters across the org";
  }
}
