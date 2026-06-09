import { type FormatToken, type MetricValue, formatMetric } from "./format";
import { MetricSkeletonBlock } from "./metric-tile";

/**
 * Scalar stat presentation, shared across all three altitudes (platform
 * analytics, org Insights, the home Impact card).
 *
 * `MetricStat` is the single tile: an eyebrow label, a big tabular value with an
 * optional unit, and an optional supporting hint (muted by default, or primary
 * for the Impact card's motivational delta). `MetricStatRow` is the token-driven
 * row built from it — two columns on small screens; from `sm` up the column
 * count matches the number of stats (to 4) so a three-stat row reads as an even
 * trio. The Impact card renders `MetricStat` directly (its values are
 * pre-formatted), so the two surfaces share one tile.
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

export function MetricStat({
  label,
  value,
  suffix,
  hint,
  hintTone = "muted",
}: {
  label: string;
  /** Pre-formatted, e.g. "1,234", "$14,235", or "12.5". */
  value: string;
  suffix?: string;
  hint?: string;
  hintTone?: "muted" | "primary";
}) {
  return (
    <div>
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-caption">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[28px] font-normal leading-none tracking-[-0.02em] text-foreground tabular-nums">
          {value}
        </span>
        {suffix ? (
          <span className="font-mono text-[14px] font-medium text-caption">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p
          className={`mt-1.5 text-[11px] leading-[1.4] tabular-nums ${
            hintTone === "primary" ? "font-medium text-primary" : "text-caption"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
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
      <div className={`grid grid-cols-2 gap-x-6 gap-y-8 ${smCols(stats.length)}`}>
        {stats.map((stat) => (
          <MetricStat
            key={stat.label}
            label={stat.label}
            value={formatMetric(stat.value, stat.format)}
            hint={stat.hint}
          />
        ))}
      </div>
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
