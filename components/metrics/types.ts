import type { FormatToken } from "./format";

/**
 * Shared presentation types for the metric primitives (components/metrics/).
 *
 * These describe HOW a metric renders, not where its data comes from — so they
 * live here, in the neutral shared metric UI kit consumed by all three altitudes
 * (platform analytics, org Insights, the home Impact card). The platform-only
 * registry + service-role read seam stay under lib/platform/metrics; nothing here
 * implies that cross-tenant data path.
 */

/**
 * One column of a table metric. `sub` renders a muted secondary value under the
 * primary (another field + token); `signal: "recency"` marks the calm at-risk
 * recency cell (the table reads the row's precomputed `recency_state`).
 */
export interface MetricColumn {
  key: string;
  label: string;
  format: FormatToken;
  align?: "start" | "end";
  sub?: { key: string; format: FormatToken };
  signal?: "recency";
}
