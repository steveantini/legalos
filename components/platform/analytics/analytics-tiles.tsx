import type { MetricValue } from "@/lib/platform/metrics/format";
import {
  METRICS,
  type ConnectorAdoptionRow,
  type CostByOrgRow,
  type CostDailyRow,
  type CostSummaryRow,
  type DemoConversionRow,
  type InviteFunnelRow,
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
 * The platform Analytics tiles (analytics arc, Steps 1-2). Each is an async
 * server component that reads its metric view(s) through the service-role admin
 * client (behind the platform-owner gate the layout enforces) and renders a
 * primitive. The page wraps each in its own <Suspense> with the matching
 * skeleton below, and groups them into labelled sections; the tiles render at
 * heading level h3 under the section's h2.
 *
 * Tile copy lives in one place (COPY) so a tile and its skeleton never drift.
 */

const COPY = {
  // Engagement group (Step 1)
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
  // Cost group (Step 2)
  costSummary: {
    title: "Spend",
    hint: "Across all customers. Today, this week, and the trailing-30-day run rate as a monthly projection.",
  },
  costByOrg: {
    title: "Spend by customer",
    hint: "Last 30 days, highest first.",
  },
  costDaily: {
    title: "Spend over time",
    hint: "Daily spend across all customers, last 30 days.",
  },
  // Adoption group (Step 2)
  funnels: {
    title: "Adoption funnels",
    hint: "How new customers and users are activating.",
  },
} as const;

const PENDING_COPY =
  "This will fill in once the platform analytics views are in place.";

const HEADING = "h3" as const;

function statsFromDef(
  stats: ReadonlyArray<{ key: string; label: string; format: StatItem["format"] }>,
  row: Record<string, MetricValue>,
): StatItem[] {
  return stats.map((stat) => ({
    label: stat.label,
    value: row[stat.key] ?? 0,
    format: stat.format,
  }));
}

// ════════════════════════ Engagement group (Step 1) ════════════════════════

export async function UsageSummaryTile() {
  const def = METRICS.usage_summary;
  const result = await readMetricView<UsageSummaryRow>(def.view);
  const row = result.ok ? result.rows[0] : undefined;

  return (
    <MetricTile title={COPY.summary.title} hint={COPY.summary.hint} headingLevel={HEADING}>
      {row ? (
        <MetricStatRow
          stats={statsFromDef(def.stats, row as unknown as Record<string, MetricValue>)}
        />
      ) : (
        <MetricTileMessage>{PENDING_COPY}</MetricTileMessage>
      )}
    </MetricTile>
  );
}

export function UsageSummaryTileSkeleton() {
  return (
    <MetricTileSkeleton title={COPY.summary.title} hint={COPY.summary.hint} headingLevel={HEADING}>
      <MetricStatRowSkeleton count={METRICS.usage_summary.stats.length} />
    </MetricTileSkeleton>
  );
}

export async function OrgHealthTile() {
  const def = METRICS.org_health;
  const result = await readMetricView<OrgHealthRow>(def.view);

  return (
    <MetricTile title={COPY.health.title} hint={COPY.health.hint} headingLevel={HEADING}>
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
    <MetricTileSkeleton title={COPY.health.title} hint={COPY.health.hint} headingLevel={HEADING}>
      <MetricTableSkeleton />
    </MetricTileSkeleton>
  );
}

export async function UsagePulseTile() {
  const def = METRICS.usage_daily;
  const result = await readMetricView<UsageDailyRow>(def.view);
  const points =
    result.ok && result.rows.length > 0
      ? result.rows.map((r) => ({ day: r.day, value: r.runs }))
      : null;

  return (
    <MetricTile title={COPY.pulse.title} hint={COPY.pulse.hint} headingLevel={HEADING}>
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
    <MetricTileSkeleton title={COPY.pulse.title} hint={COPY.pulse.hint} headingLevel={HEADING}>
      <MetricChartSkeleton />
    </MetricTileSkeleton>
  );
}

// ═════════════════════════════ Cost group (Step 2) ═════════════════════════════

export async function CostSummaryTile() {
  const def = METRICS.cost_summary;
  const result = await readMetricView<CostSummaryRow>(def.view);
  const row = result.ok ? result.rows[0] : undefined;

  return (
    <MetricTile title={COPY.costSummary.title} hint={COPY.costSummary.hint} headingLevel={HEADING}>
      {row ? (
        <MetricStatRow
          stats={statsFromDef(def.stats, row as unknown as Record<string, MetricValue>)}
        />
      ) : (
        <MetricTileMessage>{PENDING_COPY}</MetricTileMessage>
      )}
    </MetricTile>
  );
}

export function CostSummaryTileSkeleton() {
  return (
    <MetricTileSkeleton title={COPY.costSummary.title} hint={COPY.costSummary.hint} headingLevel={HEADING}>
      <MetricStatRowSkeleton count={METRICS.cost_summary.stats.length} />
    </MetricTileSkeleton>
  );
}

export async function CostByOrgTile() {
  const def = METRICS.cost_by_org;
  const result = await readMetricView<CostByOrgRow>(def.view);

  return (
    <MetricTile title={COPY.costByOrg.title} hint={COPY.costByOrg.hint} headingLevel={HEADING}>
      {result.ok ? (
        <MetricTable
          columns={def.columns}
          rows={result.rows as unknown as Record<string, MetricValue>[]}
          emptyLabel="No customers yet."
        />
      ) : (
        <MetricTileMessage>{PENDING_COPY}</MetricTileMessage>
      )}
    </MetricTile>
  );
}

export function CostByOrgTileSkeleton() {
  return (
    <MetricTileSkeleton title={COPY.costByOrg.title} hint={COPY.costByOrg.hint} headingLevel={HEADING}>
      <MetricTableSkeleton rows={2} />
    </MetricTileSkeleton>
  );
}

export async function CostDailyTile() {
  const def = METRICS.cost_daily;
  const result = await readMetricView<CostDailyRow>(def.view);
  const points =
    result.ok && result.rows.length > 0
      ? result.rows.map((r) => ({ day: r.day, value: r.cost_micro_usd }))
      : null;

  return (
    <MetricTile title={COPY.costDaily.title} hint={COPY.costDaily.hint} headingLevel={HEADING}>
      {points ? (
        <MetricChart
          points={points}
          ariaLabel="Daily spend across all customers over the last 30 days"
        />
      ) : (
        <MetricTileMessage>{PENDING_COPY}</MetricTileMessage>
      )}
    </MetricTile>
  );
}

export function CostDailyTileSkeleton() {
  return (
    <MetricTileSkeleton title={COPY.costDaily.title} hint={COPY.costDaily.hint} headingLevel={HEADING}>
      <MetricChartSkeleton />
    </MetricTileSkeleton>
  );
}

// ═══════════════════════ Adoption-funnels group (Step 2) ═══════════════════════

/**
 * One tile for the three activation funnels (invite acceptance, connector
 * adoption, demo-link conversion). Each funnel is a small view; presenting the
 * three headline rates together as one stat-row, each with a muted "x of y"
 * context line, is the legible, restrained read (rather than three near-empty
 * tiles). Reads degrade per-funnel: a not-yet-applied view shows "—" for that
 * rate; only when all three are unavailable does the tile show the pending state.
 */
export async function AdoptionFunnelsTile() {
  const [invite, connector, demo] = await Promise.all([
    readMetricView<InviteFunnelRow>(METRICS.invite_funnel.view),
    readMetricView<ConnectorAdoptionRow>(METRICS.connector_adoption.view),
    readMetricView<DemoConversionRow>(METRICS.demo_conversion.view),
  ]);

  if (!invite.ok && !connector.ok && !demo.ok) {
    return (
      <MetricTile title={COPY.funnels.title} hint={COPY.funnels.hint} headingLevel={HEADING}>
        <MetricTileMessage>{PENDING_COPY}</MetricTileMessage>
      </MetricTile>
    );
  }

  const inviteRow = invite.ok ? invite.rows[0] : undefined;
  const connectorRow = connector.ok ? connector.rows[0] : undefined;
  const demoRow = demo.ok ? demo.rows[0] : undefined;

  const n = (v: number) => v.toLocaleString("en-US");

  const inviteResolved = inviteRow
    ? inviteRow.accepted + inviteRow.revoked + inviteRow.expired
    : 0;

  const stats: StatItem[] = [
    {
      label: "Invite acceptance",
      value: inviteRow ? inviteRow.acceptance_rate : null,
      format: "percent",
      hint: inviteRow
        ? inviteResolved > 0
          ? `${n(inviteRow.accepted)} of ${n(inviteResolved)} resolved`
          : "No invitations yet"
        : undefined,
    },
    {
      label: "Connector adoption",
      value: connectorRow ? connectorRow.adoption_rate : null,
      format: "percent",
      hint: connectorRow
        ? `${n(connectorRow.orgs_connected)} of ${n(connectorRow.total_orgs)} customers`
        : undefined,
    },
    {
      label: "Demo conversion",
      value: demoRow ? demoRow.conversion_rate : null,
      format: "percent",
      hint: demoRow
        ? demoRow.minted > 0
          ? `${n(demoRow.consumed)} of ${n(demoRow.minted)} minted`
          : "No demo links yet"
        : undefined,
    },
  ];

  return (
    <MetricTile title={COPY.funnels.title} hint={COPY.funnels.hint} headingLevel={HEADING}>
      <MetricStatRow stats={stats} />
    </MetricTile>
  );
}

export function AdoptionFunnelsTileSkeleton() {
  return (
    <MetricTileSkeleton title={COPY.funnels.title} hint={COPY.funnels.hint} headingLevel={HEADING}>
      <MetricStatRowSkeleton count={3} />
    </MetricTileSkeleton>
  );
}
