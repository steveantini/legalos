import { modelDisplayName } from "@/lib/llm/model-label";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Org-wide Insights math (A4a) — the MEASURED usage/adoption lens.
 *
 * Generalizes the home impact band (lib/workspace/home/impact-math.ts) from a
 * single user to the whole organization: same calendar-anchored week/month/YTD
 * windows, the same exact HEAD counts for headline figures, the same JS-side
 * bucketing for sparklines and the same honest zero-state fallback — but scoped
 * org-wide. Where the home band filters `.eq("user_id", …)`, this drops the user
 * filter and relies on the `usage_events_admin_read` RLS policy (super/org admin,
 * same org) plus an explicit `organization_id` filter as defense-in-depth.
 *
 * One usage_events row ≈ one agent run (one assistant turn). This lens measures
 * NATIVE agent activity only — external-agent clicks (Gemini/watsonX links) are
 * not in usage_events. Cost is deliberately NOT surfaced here (A4b, gated on the
 * business-model decision); cost_micro_usd is never read.
 *
 * Dimensions: runs over time (headline + sparkline), by agent, by department
 * (via agent.department_id — the clean rollup, since user→department is
 * many-to-many), by model, and by user, plus active-user counts and an
 * adoption-gap signal (agents that exist but have never been run).
 *
 * SCALE CAVEAT: headline figures use exact HEAD counts and stay correct at any
 * volume. The breakdowns and sparklines read row bodies for the current year and
 * aggregate in JS, which is bounded by PostgREST's ~1000-row default select
 * ceiling. At current volume (hundreds–low-thousands of rows, single org) this is
 * fine. If an org grows busy, move the group-bys to SQL-side aggregation (a
 * Postgres rpc/view doing count/group-by) rather than reading rows into JS; the
 * HEAD counts already scale, so only the breakdowns would change.
 */

export type InsightsTimeframe = "week" | "month" | "ytd";

/** One labeled row in a breakdown (by agent / department / model / user). */
export type InsightsBreakdownRow = {
  id: string;
  label: string;
  runs: number;
};

/** Everything one timeframe needs to render. */
export type InsightsWindow = {
  runs: {
    /** Exact run count in the current window. */
    current: number;
    /** Exact run count in the comparison window, or null (YTD has none). */
    previous: number | null;
    /** Signed current - previous, or null when there's no comparison. */
    delta: number | null;
    /** e.g. "vs last week" / "vs April"; null for YTD. */
    comparisonLabel: string | null;
    /** Run counts bucketed across the current window, oldest to newest. */
    sparkline: number[];
  };
  /** Distinct users who ran an agent in the current window. */
  activeUsers: number;
  byAgent: InsightsBreakdownRow[];
  byDepartment: InsightsBreakdownRow[];
  byModel: InsightsBreakdownRow[];
  byUser: InsightsBreakdownRow[];
};

export type InsightsData = {
  week: InsightsWindow;
  month: InsightsWindow;
  ytd: InsightsWindow;
  agents: {
    /** Native, active (non-deleted) agents in the org. */
    total: number;
    /** Of those, how many have never been run (lifetime). Adoption-gap signal. */
    unused: number;
  };
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOP_N = 8;
const UNKNOWN_LABEL = "Unknown";
const NO_DEPARTMENT_LABEL = "No department";

/** A single raw usage row, the only columns the breakdowns need (no cost). */
type RawUsageRow = {
  created_at: string;
  agent_id: string | null;
  user_id: string | null;
  model: string | null;
};

/** Window config: resolved boundaries + presentation metadata. */
type WindowConfig = {
  currentStart: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
  bucketCount: number;
  comparisonLabel: string | null;
};

/** Honest empty window (used when a query fails or there's no data). */
function emptyWindow(
  comparisonLabel: string | null,
  bucketCount: number,
): InsightsWindow {
  return {
    runs: {
      current: 0,
      previous: comparisonLabel === null ? null : 0,
      delta: comparisonLabel === null ? null : 0,
      comparisonLabel,
      sparkline: Array<number>(bucketCount).fill(0),
    },
    activeUsers: 0,
    byAgent: [],
    byDepartment: [],
    byModel: [],
    byUser: [],
  };
}

/** The all-zero dataset; the band still renders honest zeros on any failure. */
function emptyInsights(now: Date): InsightsData {
  const cfgs = resolveWindowConfigs(now);
  return {
    week: emptyWindow(cfgs.week.comparisonLabel, cfgs.week.bucketCount),
    month: emptyWindow(cfgs.month.comparisonLabel, cfgs.month.bucketCount),
    ytd: emptyWindow(cfgs.ytd.comparisonLabel, cfgs.ytd.bucketCount),
    agents: { total: 0, unused: 0 },
  };
}

/**
 * Bucket event timestamps into `count` equal-time slices over [startMs, endMs).
 * Mirrors the home band's approach: the sparkline is decorative (the headline
 * count carries the precise meaning), so uniform slicing is a fine choice.
 */
function bucketCounts(
  times: number[],
  startMs: number,
  endMs: number,
  count: number,
): number[] {
  const buckets = Array<number>(count).fill(0);
  const span = endMs - startMs;
  if (span <= 0) return buckets;
  for (const t of times) {
    if (t < startMs || t >= endMs) continue;
    let index = Math.floor(((t - startMs) / span) * count);
    if (index < 0) index = 0;
    else if (index >= count) index = count - 1;
    buckets[index] += 1;
  }
  return buckets;
}

/** Calendar-anchored windows in UTC (no stored user timezone; server-side). */
function resolveWindowConfigs(now: Date): {
  week: WindowConfig;
  month: WindowConfig;
  ytd: WindowConfig;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();

  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const weekStart = new Date(Date.UTC(year, month, date - daysSinceMonday));
  const lastWeekStart = new Date(weekStart.getTime() - 7 * MS_PER_DAY);

  const monthStart = new Date(Date.UTC(year, month, 1));
  const prevMonthStart = new Date(Date.UTC(year, month - 1, 1));
  const prevMonthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(prevMonthStart);

  const yearStart = new Date(Date.UTC(year, 0, 1));

  return {
    week: {
      currentStart: weekStart,
      previousStart: lastWeekStart,
      previousEnd: weekStart,
      bucketCount: Math.max(1, daysSinceMonday + 1),
      comparisonLabel: "vs last week",
    },
    month: {
      currentStart: monthStart,
      previousStart: prevMonthStart,
      previousEnd: monthStart,
      bucketCount: Math.max(1, Math.min(12, date)),
      comparisonLabel: `vs ${prevMonthName}`,
    },
    ytd: {
      currentStart: yearStart,
      previousStart: null,
      previousEnd: null,
      bucketCount: Math.max(1, month + 1),
      comparisonLabel: null,
    },
  };
}

/** Tally a dimension over rows, resolve labels, return the top N descending. */
function topBreakdown(
  rows: RawUsageRow[],
  keyOf: (row: RawUsageRow) => string | null,
  labelOf: (id: string) => string,
): InsightsBreakdownRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row) ?? UNKNOWN_LABEL;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, runs]) => ({ id, label: labelOf(id), runs }))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, TOP_N);
}

/** Build one window from the pre-read current-year rows plus exact HEAD counts. */
function buildWindow(
  cfg: WindowConfig,
  now: Date,
  currentCount: number,
  previousCount: number | null,
  yearRows: RawUsageRow[],
  agentNameById: Map<string, string>,
  agentDeptById: Map<string, string | null>,
  deptNameById: Map<string, string>,
  userNameById: Map<string, string>,
): InsightsWindow {
  const startMs = cfg.currentStart.getTime();
  const endMs = now.getTime();
  const windowRows = yearRows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= startMs && t < endMs;
  });

  const sparkline = bucketCounts(
    windowRows.map((r) => new Date(r.created_at).getTime()),
    startMs,
    endMs,
    cfg.bucketCount,
  );

  const activeUsers = new Set(
    windowRows.map((r) => r.user_id).filter((id): id is string => Boolean(id)),
  ).size;

  return {
    runs: {
      current: currentCount,
      previous: previousCount,
      delta: previousCount === null ? null : currentCount - previousCount,
      comparisonLabel: cfg.comparisonLabel,
      sparkline,
    },
    activeUsers,
    byAgent: topBreakdown(
      windowRows,
      (r) => r.agent_id,
      (id) => agentNameById.get(id) ?? UNKNOWN_LABEL,
    ),
    byDepartment: topBreakdown(
      windowRows,
      (r) => (r.agent_id ? (agentDeptById.get(r.agent_id) ?? null) : null),
      (id) => deptNameById.get(id) ?? NO_DEPARTMENT_LABEL,
    ),
    byModel: topBreakdown(
      windowRows,
      (r) => r.model,
      (id) => modelDisplayName(id) || id,
    ),
    byUser: topBreakdown(
      windowRows,
      (r) => r.user_id,
      (id) => userNameById.get(id) ?? UNKNOWN_LABEL,
    ),
  };
}

/**
 * Loads the org-wide Insights dataset across all three timeframes in one server
 * call, so the client timeframe toggle swaps instantly with no further fetch
 * (the home impact-band pattern). Returns honest zeros on any failure.
 *
 * RLS-scoped: every read uses the per-request client; `usage_events_admin_read`
 * and the org-scoped agents/departments/users policies restrict reads to the
 * caller's org. The page gates to org-admin on top (mirror-RLS).
 */
export async function getOrgInsights(): Promise<InsightsData> {
  const now = new Date();
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return emptyInsights(now);

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = profile?.organization_id as string | undefined;
    if (!orgId) return emptyInsights(now);

    const cfgs = resolveWindowConfigs(now);
    const nowIso = now.toISOString();
    const yearStartIso = cfgs.ytd.currentStart.toISOString();

    const headCount = (start: Date, end: Date) =>
      supabase
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString());

    // Exact headline counts per window + comparison windows.
    const weekCountQ = headCount(cfgs.week.currentStart, now);
    const weekPrevQ = headCount(cfgs.week.previousStart!, cfgs.week.previousEnd!);
    const monthCountQ = headCount(cfgs.month.currentStart, now);
    const monthPrevQ = headCount(
      cfgs.month.previousStart!,
      cfgs.month.previousEnd!,
    );
    const ytdCountQ = headCount(cfgs.ytd.currentStart, now);

    // One raw read over the current year; week/month are derived in JS. Capped
    // by the default row ceiling (see the SCALE CAVEAT in the file header).
    const yearRowsQ = supabase
      .from("usage_events")
      .select("created_at, agent_id, user_id, model")
      .eq("organization_id", orgId)
      .gte("created_at", yearStartIso)
      .lt("created_at", nowIso)
      .order("created_at", { ascending: true });

    // Lifetime distinct agent_ids that have any usage (for the unused-agents
    // signal). Capped read; deduped in JS. A SQL distinct is the scale path.
    const usedAgentsQ = supabase
      .from("usage_events")
      .select("agent_id")
      .eq("organization_id", orgId);

    // All org agents (including soft-deleted, so labels resolve) for name +
    // department resolution and the total/unused tallies.
    const agentsQ = supabase
      .from("agents")
      .select("id, name, department_id, type, is_active, deleted_at")
      .eq("organization_id", orgId);

    const departmentsQ = supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", orgId);

    const usersQ = supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId);

    const [
      weekCount,
      weekPrev,
      monthCount,
      monthPrev,
      ytdCount,
      yearRows,
      usedAgents,
      agents,
      departments,
      users,
    ] = await Promise.all([
      weekCountQ,
      weekPrevQ,
      monthCountQ,
      monthPrevQ,
      ytdCountQ,
      yearRowsQ,
      usedAgentsQ,
      agentsQ,
      departmentsQ,
      usersQ,
    ]);

    if (yearRows.error || agents.error) {
      return emptyInsights(now);
    }

    // Resolution maps.
    const agentNameById = new Map<string, string>();
    const agentDeptById = new Map<string, string | null>();
    let totalAgents = 0;
    for (const a of agents.data ?? []) {
      agentNameById.set(a.id as string, (a.name as string) ?? "Untitled agent");
      agentDeptById.set(a.id as string, (a.department_id as string | null) ?? null);
      if (a.type === "native" && a.is_active === true && a.deleted_at === null) {
        totalAgents += 1;
      }
    }

    const deptNameById = new Map<string, string>();
    for (const d of departments.data ?? []) {
      deptNameById.set(d.id as string, (d.name as string) ?? UNKNOWN_LABEL);
    }

    const userNameById = new Map<string, string>();
    for (const u of users.data ?? []) {
      userNameById.set(
        u.id as string,
        ((u.full_name as string | null)?.trim() || (u.email as string)) ??
          UNKNOWN_LABEL,
      );
    }

    // Unused = native+active agents whose id never appears in any usage row.
    const usedAgentIds = new Set(
      (usedAgents.data ?? [])
        .map((r) => r.agent_id as string | null)
        .filter((id): id is string => Boolean(id)),
    );
    let unusedAgents = 0;
    for (const a of agents.data ?? []) {
      if (
        a.type === "native" &&
        a.is_active === true &&
        a.deleted_at === null &&
        !usedAgentIds.has(a.id as string)
      ) {
        unusedAgents += 1;
      }
    }

    const yearRowData = (yearRows.data ?? []) as RawUsageRow[];

    const build = (
      cfg: WindowConfig,
      current: number,
      previous: number | null,
    ) =>
      buildWindow(
        cfg,
        now,
        current,
        previous,
        yearRowData,
        agentNameById,
        agentDeptById,
        deptNameById,
        userNameById,
      );

    return {
      week: build(cfgs.week, weekCount.count ?? 0, weekPrev.count ?? 0),
      month: build(cfgs.month, monthCount.count ?? 0, monthPrev.count ?? 0),
      ytd: build(cfgs.ytd, ytdCount.count ?? 0, null),
      agents: { total: totalAgents, unused: unusedAgents },
    };
  } catch (err) {
    console.error("getOrgInsights failed", err);
    return emptyInsights(now);
  }
}
