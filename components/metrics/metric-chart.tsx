import { MetricSkeletonBlock } from "./metric-tile";

/**
 * MetricChart — a hand-rolled SVG line for a timeseries metric (analytics arc,
 * Step 1). No charting dependency: the project draws its own SVG (sparkline.tsx,
 * the Insights bars), and this matches that house style one size up.
 *
 * Deterministic from props, so it renders server-side with no hydration concern.
 * The line scales 0..max (the baseline is a true zero, so the shape is honest),
 * with a faint area fill, an endpoint dot, and the date range labelled beneath.
 * Decorative SVG marked `role="img"` with a summarising label; the stat-row
 * above carries the precise totals.
 */

export interface ChartPoint {
  /** ISO date (YYYY-MM-DD) for the x position and the range labels. */
  day: string;
  value: number;
}

const W = 720;
const H = 150;
const PAD_Y = 10;

export function MetricChart({
  points,
  ariaLabel,
}: {
  points: ChartPoint[];
  ariaLabel: string;
}) {
  if (points.length === 0) return null;

  const max = Math.max(1, ...points.map((p) => p.value));
  const innerH = H - PAD_Y * 2;

  const xy = points.map((p, i) => {
    const x = points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;
    const y = PAD_Y + (1 - p.value / max) * innerH;
    return { x, y };
  });

  const linePoints = xy.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPoints = `0,${H} ${linePoints} ${W},${H}`;
  const last = xy[xy.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {/* True-zero baseline */}
        <line
          x1="0"
          y1={H - PAD_Y}
          x2={W}
          y2={H - PAD_Y}
          className="stroke-hairline-strong"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <polygon points={areaPoints} className="fill-primary/10" />
        <polyline
          points={linePoints}
          fill="none"
          className="stroke-primary"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={last.x} cy={last.y} r="3" className="fill-primary" />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-caption tabular-nums">
        <span>{shortDay(points[0].day)}</span>
        <span>{shortDay(points[points.length - 1].day)}</span>
      </div>
    </div>
  );
}

/** "2026-06-09" → "Jun 9", pinned to UTC so the date never drifts a day. */
function shortDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** Matching skeleton: a chart-height block plus the two range labels. */
export function MetricChartSkeleton() {
  return (
    <div>
      <MetricSkeletonBlock className="h-[150px] w-full" />
      <div className="mt-2 flex items-center justify-between">
        <MetricSkeletonBlock className="h-2.5 w-10" />
        <MetricSkeletonBlock className="h-2.5 w-10" />
      </div>
    </div>
  );
}
