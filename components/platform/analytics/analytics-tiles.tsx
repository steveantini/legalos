import type { MetricValue } from "@/lib/platform/metrics/format";
import {
  METRICS,
  type OrgHealthRow,
  type UsageDailyRow,
  type UsageSummaryRow,
} from "@/lib/platform/metrics/registry";
import { readMetricView } from "@/lib/platform/metrics/read";

import { MetricChart, MetricChartSkeleton } from "@/components/platform/metrics/metric-chart";
import {
  MetricStatRow,
  MetricStatRowSkeleton,
  type StatItem,
} from "@/components/platform/metrics/metric-stat-row";
import { MetricTable, MetricTableSkeleton } from "@/components/platform/metrics/metric-table";
import {
  MetricTile,
  MetricTileMessage,
  MetricTileSkeleton,
} from "@/components/platform/metrics/metric-tile";

/**
 * The platform Analytics tiles (analytics arc, Step 1). Each is an async server
 * component that reads its metric view through the service-role admin client
 * (behind the platform-owner gate the layout enforces) and renders a primitive.
 * The page wraps each in its own <Suspense> with the matching skeleton below, so
 * the surface streams in tile by tile and never blocks on the slowest read.
 *
 * Tile copy lives in one place (COPY) so a tile and its skeleton can never drift.
 */

const COPY = {
  summary: {
    title: "Platform totals",
    hint: "Across all customers, last 30 days. Demo organizations excluded.",
  },
  health: {
    title: "Customer health",
    hint: "Each customer's activation, usage trend, and how recently they were active.",
  },
  pulse: {
    title: "Usage pulse",
    hint: "Agent runs across all customers, last 30 days.",
  },
} as const;

const PENDING_COPY =
  "This will fill in once the platform analytics views are in place.";

// ── Tile 1: the 30-day scalar summary (the only place cost is shown) ──

export async function UsageSummaryTile() {
  const def = METRICS.usage_summary;
  const result = await readMetricView<UsageSummaryRow>(def.view);
  const row = result.ok ? result.rows[0] : undefined;

  return (
    <MetricTile title={COPY.summary.title} hint={COPY.summary.hint}>
      {row ? (
        <MetricStatRow stats={summaryStats(row)} />
      ) : (
        <MetricTileMessage>{PENDING_COPY}</MetricTileMessage>
      )}
    </MetricTile>
  );
}

function summaryStats(row: UsageSummaryRow): StatItem[] {
  const r = row as unknown as Record<string, MetricValue>;
  return METRICS.usage_summary.stats.map((stat) => ({
    label: stat.label,
    value: r[stat.key] ?? 0,
    format: stat.format,
  }));
}

export function UsageSummaryTileSkeleton() {
  return (
    <MetricTileSkeleton title={COPY.summary.title} hint={COPY.summary.hint}>
      <MetricStatRowSkeleton count={METRICS.usage_summary.stats.length} />
    </MetricTileSkeleton>
  );
}

// ── Tile 2: the per-customer adoption/engagement-health hero (the centerpiece) ──

export async function OrgHealthTile() {
  const def = METRICS.org_health;
  const result = await readMetricView<OrgHealthRow>(def.view);

  return (
    <MetricTile title={COPY.health.title} hint={COPY.health.hint}>
      {result.ok ? (
        <MetricTable
          columns={def.columns}
          rows={result.rows.map(shapeOrgHealthRow)}
          emptyLabel="No customers yet."
        />
      ) : (
        <MetricTileMessage>{PENDING_COPY}</MetricTileMessage>
      )}
    </MetricTile>
  );
}

/**
 * Shapes a raw health row into the record the hero table renders: the columns it
 * reads directly, plus the precomputed muted sub-labels and the recency state
 * (the calm at-risk rule lives here, not in the view or the table). A customer is
 * "quiet" when they have seats and were active before but not in the last 30
 * days; "none" when they have never run anything (neutral, not warned).
 */
function shapeOrgHealthRow(row: OrgHealthRow): Record<string, MetricValue> {
  const trend =
    row.runs_delta > 0
      ? `+${row.runs_delta.toLocaleString("en-US")}`
      : row.runs_delta < 0
        ? row.runs_delta.toLocaleString("en-US")
        : "even";

  const recencyState =
    row.last_activity_at === null
      ? "none"
      : row.active_users_30d === 0 && row.seats > 0
        ? "quiet"
        : "active";

  return {
    organization_id: row.organization_id,
    name: row.name,
    activation_rate: row.activation_rate,
    activation_sub: `${row.active_users_30d.toLocaleString("en-US")} / ${row.seats.toLocaleString("en-US")}`,
    runs_30d: row.runs_30d,
    runs_sub: trend,
    last_activity_at: row.last_activity_at,
    agents_never_run: row.agents_never_run,
    agents_sub: row.agents_total > 0 ? `of ${row.agents_total.toLocaleString("en-US")}` : "",
    recency_state: recencyState,
  };
}

export function OrgHealthTileSkeleton() {
  return (
    <MetricTileSkeleton title={COPY.health.title} hint={COPY.health.hint}>
      <MetricTableSkeleton />
    </MetricTileSkeleton>
  );
}

// ── Tile 3: the cross-customer usage-pulse line ──

export async function UsagePulseTile() {
  const def = METRICS.usage_daily;
  const result = await readMetricView<UsageDailyRow>(def.view);
  const points =
    result.ok && result.rows.length > 0
      ? result.rows.map((r) => ({ day: r.day, value: r.runs }))
      : null;

  return (
    <MetricTile title={COPY.pulse.title} hint={COPY.pulse.hint}>
      {points ? (
        <MetricChart
          points={points}
          ariaLabel="Daily agent runs across all customers over the last 30 days"
        />
      ) : (
        <MetricTileMessage>{PENDING_COPY}</MetricTileMessage>
      )}
    </MetricTile>
  );
}

export function UsagePulseTileSkeleton() {
  return (
    <MetricTileSkeleton title={COPY.pulse.title} hint={COPY.pulse.hint}>
      <MetricChartSkeleton />
    </MetricTileSkeleton>
  );
}
