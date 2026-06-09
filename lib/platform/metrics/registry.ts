/**
 * The metric registry (analytics arc, Step 1).
 *
 * A metric is a named SQL VIEW plus a small, PURE-DATA definition of how to
 * render it. This registry is the single source the platform-analytics tiles
 * read: each tile looks up its def, reads `def.view` through the service-role
 * admin client, and hands the rows to a primitive that formats by token. Adding
 * a future metric is therefore turnkey: write the view (a migration), add one
 * entry here, and drop a tile.
 *
 * Defs stay serializable — string format tokens only, no functions — so they
 * could later cross a server/client boundary unchanged (today the tiles are
 * server components, so it never has to).
 */

import type { FormatToken } from "./format";

export type MetricKind = "scalar" | "timeseries" | "table";

/** One scalar stat in a stat-row, read from a named field of the (single) row. */
export interface MetricStat {
  key: string;
  label: string;
  format: FormatToken;
}

/**
 * One column of a table metric. `sub` renders a muted secondary value under the
 * primary (e.g. "4 / 6" beneath an activation rate) — another field + token, so
 * the column stays pure data. `signal: "recency"` marks the cell as the calm
 * at-risk recency signal; the table reads the named companion fields to decide
 * whether a customer has gone quiet (see MetricTable).
 */
export interface MetricColumn {
  key: string;
  label: string;
  format: FormatToken;
  align?: "start" | "end";
  sub?: { key: string; format: FormatToken };
  signal?: "recency";
}

export interface MetricDef {
  key: string;
  kind: MetricKind;
  view: string;
  window?: { days: number };
  /** scalar */
  stats?: MetricStat[];
  /** table */
  columns?: MetricColumn[];
  /** timeseries */
  x?: string;
  series?: { key: string; label: string; format: FormatToken };
}

/**
 * The three Step-1 metrics. Field names match the view columns from migration
 * 0067. The org_health tile shapes a couple of precomputed sub-label fields
 * (activation_sub, runs_sub, agents_sub) onto each row before rendering, so the
 * `sub` columns below reference those; everything else maps straight to a view
 * column.
 */
export const METRICS = {
  usage_summary: {
    key: "usage_summary",
    kind: "scalar",
    view: "operator_usage_summary",
    window: { days: 30 },
    stats: [
      { key: "active_orgs", label: "Active customers", format: "int" },
      { key: "active_users_30d", label: "Active users", format: "int" },
      { key: "runs_30d", label: "Agent runs", format: "compact" },
      { key: "cost_micro_usd_30d", label: "Cost", format: "usd" },
    ],
  },
  org_health: {
    key: "org_health",
    kind: "table",
    view: "operator_org_health",
    window: { days: 30 },
    columns: [
      { key: "name", label: "Customer", format: "text", align: "start" },
      {
        key: "activation_rate",
        label: "Activation",
        format: "percent",
        align: "end",
        sub: { key: "activation_sub", format: "text" },
      },
      {
        key: "runs_30d",
        label: "Runs",
        format: "int",
        align: "end",
        sub: { key: "runs_sub", format: "text" },
      },
      {
        key: "last_activity_at",
        label: "Last active",
        format: "relative-time",
        align: "end",
        signal: "recency",
      },
      {
        key: "agents_never_run",
        label: "Unused agents",
        format: "int",
        align: "end",
        sub: { key: "agents_sub", format: "text" },
      },
    ],
  },
  usage_daily: {
    key: "usage_daily",
    kind: "timeseries",
    view: "operator_usage_daily",
    window: { days: 30 },
    x: "day",
    series: { key: "runs", label: "Agent runs", format: "int" },
  },
} satisfies Record<string, MetricDef>;

// ── Row shapes the views return (so the tiles read typed rows, not `any`) ──

export interface UsageSummaryRow {
  active_orgs: number;
  active_users_30d: number;
  runs_30d: number;
  cost_micro_usd_30d: number;
}

export interface OrgHealthRow {
  organization_id: string;
  name: string;
  seats: number;
  active_users_30d: number;
  activation_rate: number;
  runs_30d: number;
  runs_prior_30d: number;
  runs_delta: number;
  last_activity_at: string | null;
  agents_total: number;
  agents_never_run: number;
}

export interface UsageDailyRow {
  day: string;
  runs: number;
  active_users: number;
  active_orgs: number;
}
