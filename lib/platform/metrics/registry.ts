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
    // Cost is deliberately NOT shown here — it has its own Cost group (Step 2),
    // so the same 30-day figure is not presented twice under two labels.
    stats: [
      { key: "active_orgs", label: "Active customers", format: "int" },
      { key: "active_users_30d", label: "Active users", format: "int" },
      { key: "runs_30d", label: "Agent runs", format: "compact" },
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

  // ── Cost group (Step 2) — shown only at the platform tier ──
  cost_summary: {
    key: "cost_summary",
    kind: "scalar",
    view: "operator_cost_summary",
    window: { days: 30 },
    stats: [
      { key: "cost_today_micro_usd", label: "Today", format: "usd" },
      { key: "cost_week_micro_usd", label: "This week", format: "usd" },
      {
        key: "projected_monthly_micro_usd",
        label: "Projected monthly",
        format: "usd",
      },
    ],
  },
  cost_by_org: {
    key: "cost_by_org",
    kind: "table",
    view: "operator_cost_by_org",
    window: { days: 30 },
    columns: [
      { key: "name", label: "Customer", format: "text", align: "start" },
      {
        key: "cost_micro_usd_30d",
        label: "Spend (30d)",
        format: "usd",
        align: "end",
      },
    ],
  },
  cost_daily: {
    key: "cost_daily",
    kind: "timeseries",
    view: "operator_cost_daily",
    window: { days: 30 },
    x: "day",
    series: { key: "cost_micro_usd", label: "Spend", format: "usd" },
  },

  // ── Adoption-funnels group (Step 2) — activation signals ──
  invite_funnel: {
    key: "invite_funnel",
    kind: "scalar",
    view: "operator_invite_funnel",
    stats: [{ key: "acceptance_rate", label: "Invite acceptance", format: "percent" }],
  },
  connector_adoption: {
    key: "connector_adoption",
    kind: "scalar",
    view: "operator_connector_adoption",
    stats: [{ key: "adoption_rate", label: "Connector adoption", format: "percent" }],
  },
  demo_conversion: {
    key: "demo_conversion",
    kind: "scalar",
    view: "operator_demo_conversion",
    stats: [{ key: "conversion_rate", label: "Demo conversion", format: "percent" }],
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

export interface CostSummaryRow {
  cost_today_micro_usd: number;
  cost_week_micro_usd: number;
  projected_monthly_micro_usd: number;
}

export interface CostByOrgRow {
  organization_id: string;
  name: string;
  cost_micro_usd_30d: number;
}

export interface CostDailyRow {
  day: string;
  cost_micro_usd: number;
}

export interface InviteFunnelRow {
  pending: number;
  accepted: number;
  revoked: number;
  expired: number;
  acceptance_rate: number;
}

export interface ConnectorAdoptionRow {
  total_orgs: number;
  orgs_connected: number;
  adoption_rate: number;
}

export interface DemoConversionRow {
  minted: number;
  consumed: number;
  conversion_rate: number;
}
