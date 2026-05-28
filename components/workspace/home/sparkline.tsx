type SparklineProps = {
  /** Series ordered oldest to newest. */
  values: number[];
  width?: number;
  height?: number;
};

/**
 * Tiny inline SVG sparkline for the impact band's Agent runs cell. Pure
 * presentation, deterministic from props, so it renders server-side with
 * no hydration concern. Decorative (`aria-hidden`): the headline number
 * and delta carry the meaning. Static in Stage 3 — a draw-in animation is
 * a later polish pass if it earns its complexity.
 *
 * Stroke and end-dot use the slate accent via the `stroke-primary` /
 * `fill-primary` token utilities. An all-zero series flattens to a line at
 * the baseline (max is floored to 1 to avoid divide-by-zero).
 *
 * Series length is variable (the impact band's windows have natural
 * granularity, e.g. one point per day so far this week): zero points render
 * nothing, a single point renders a flat mid-line with the end dot (there is
 * no trend to draw, and the index math below assumes two or more points).
 */
export function Sparkline({ values, width = 80, height = 20 }: SparklineProps) {
  if (values.length === 0) return null;

  if (values.length === 1) {
    const midY = height / 2;
    return (
      <svg width={width} height={height} className="block" aria-hidden="true">
        <polyline
          points={`0,${midY} ${width},${midY}`}
          fill="none"
          className="stroke-primary"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={width} cy={midY} r="2" className="fill-primary" />
      </svg>
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const lastX = width;
  const lastY = height - ((values[values.length - 1] - min) / range) * height;

  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        className="stroke-primary"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2" className="fill-primary" />
    </svg>
  );
}
