import { type FormatToken, type MetricValue, formatMetric } from "@/lib/platform/metrics/format";

import { MetricSkeletonBlock } from "./metric-tile";

/**
 * MetricStatRow — a row of scalar stat tiles (analytics arc, Step 1).
 *
 * Token-driven: each stat is a label plus a raw value and a FormatToken; the row
 * formats via `formatMetric`, so a tile never hand-formats. Two columns on small
 * screens; from `sm` up the column count matches the number of stats (to 4) so a
 * three-stat row reads as an even trio rather than three-in-a-row-of-four.
 * Numbers are tabular so they align as they change.
 */

// Static class strings (Tailwind can't see dynamically-built names).
const SM_COLS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

function smCols(count: number): string {
  return SM_COLS[Math.min(Math.max(count, 1), 4)] ?? "sm:grid-cols-4";
}

export interface StatItem {
  label: string;
  value: MetricValue;
  format: FormatToken;
  /** Optional muted supporting line under the number (e.g. "12 of 18 resolved"). */
  hint?: string;
}

export function MetricStatRow({
  stats,
  caption,
}: {
  stats: StatItem[];
  caption?: string;
}) {
  return (
    <div>
      {caption ? (
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.14em] text-caption">
          {caption}
        </p>
      ) : null}
      <dl className={`grid grid-cols-2 gap-x-6 gap-y-8 ${smCols(stats.length)}`}>
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[12px] text-caption">{stat.label}</dt>
            <dd className="mt-1.5 text-[28px] font-normal leading-none tracking-[-0.02em] text-foreground tabular-nums">
              {formatMetric(stat.value, stat.format)}
            </dd>
            {stat.hint ? (
              <p className="mt-1.5 text-[11px] leading-[1.4] text-caption tabular-nums">
                {stat.hint}
              </p>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Matching skeleton: the same 2/N-column grid of stat-sized blocks. */
export function MetricStatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-8 ${smCols(count)}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <MetricSkeletonBlock className="h-3 w-20" />
          <MetricSkeletonBlock className="mt-2 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
