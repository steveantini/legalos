import Link from "next/link";

import {
  getImpactBandData,
  type ImpactBandData,
} from "@/lib/workspace/home/impact-math";

import { ImpactCell } from "./impact-cell";

type ImpactBandProps = {
  userId: string;
  /** Gates the calculator CTAs, which route to an admin-only page. */
  isAdmin: boolean;
};

/**
 * Workspace home impact band (Stage 3): a single tinted container holding
 * four cells separated by hairline rules. Two cells (Agent runs, Top
 * agent) render real data from the user's `usage_events`; two (Hours
 * saved, Estimated cost saved) show an honest "Setup needed" state until
 * the calculator's task book is promoted to the database.
 *
 * Server component — awaits `getImpactBandData`, so the page wraps it in
 * Suspense with a matching skeleton.
 *
 * The Set up / "How this is calculated" links point at the admin-gated
 * /workspace/admin/calculator, so they render only when `isAdmin` is true
 * (mirroring the route's own gate). Non-admins see the honest "Setup
 * needed" status without a dead CTA. When the calculator's task book is
 * promoted to the database (separate sub-arc), these cells flip to real
 * data for everyone and the gating falls away.
 */
export async function ImpactBand({ userId, isAdmin }: ImpactBandProps) {
  const data = await getImpactBandData(userId);

  return (
    <section
      aria-labelledby="impact-band-heading"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <div className="h-px w-6 bg-caption" />
        <h2
          id="impact-band-heading"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption"
        >
          {data.monthLabel} · this month
        </h2>
      </div>

      <div className="rounded-xl border border-border bg-paper-2 p-1">
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
            value={String(data.agentRuns.thisMonth)}
            delta={formatRunsDelta(data.agentRuns)}
            sparkline={data.agentRuns.last12DaysSparkline}
          />
          <ImpactCell
            mode="text"
            label="Top agent"
            primary={data.topAgent.name ?? "—"}
            secondary={
              data.topAgent.name
                ? `${data.topAgent.runsThisMonth} runs this month`
                : "No runs yet this month"
            }
          />
        </div>
      </div>

      <div className="flex items-baseline justify-between px-1">
        <span className="text-[12px] text-caption">
          Based on the calculator’s task book for your role.
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
    </section>
  );
}

/**
 * Delta line for Agent runs. Hidden entirely when there's no activity in
 * either month; calls out the absence of a baseline on a user's first
 * active month rather than showing a misleading "+N".
 */
function formatRunsDelta(
  runs: ImpactBandData["agentRuns"],
): string | undefined {
  if (runs.prevMonth === 0 && runs.thisMonth === 0) return undefined;
  if (runs.prevMonth === 0) return "First full month, no baseline yet";
  const sign = runs.delta >= 0 ? "+" : "";
  return `${sign}${runs.delta} vs last month`;
}
