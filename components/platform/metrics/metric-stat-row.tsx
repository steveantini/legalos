import { type FormatToken, type MetricValue, formatMetric } from "@/lib/platform/metrics/format";

import { MetricSkeletonBlock } from "./metric-tile";

/**
 * MetricStatRow — a row of scalar stat tiles (analytics arc, Step 1).
 *
 * Token-driven: each stat is a label plus a raw value and a FormatToken; the row
 * formats via `formatMetric`, so a tile never hand-formats. Two columns on small
 * screens, four from `sm` up. Numbers are tabular so they align as they change.
 */

export interface StatItem {
  label: string;
  value: MetricValue;
  format: FormatToken;
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
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[12px] text-caption">{stat.label}</dt>
            <dd className="mt-1.5 text-[28px] font-normal leading-none tracking-[-0.02em] text-foreground tabular-nums">
              {formatMetric(stat.value, stat.format)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Matching skeleton: the same 2/4-column grid of stat-sized blocks. */
export function MetricStatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <MetricSkeletonBlock className="h-3 w-20" />
          <MetricSkeletonBlock className="mt-2 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
