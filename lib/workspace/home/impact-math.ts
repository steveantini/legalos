import { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * The three calendar-anchored windows the impact band can display.
 */
export type Timeframe = "week" | "month" | "ytd";

/**
 * Data for one timeframe. Only the two cells backed by real data are
 * modeled here — Agent runs and Top agent, both sourced from the user's
 * `usage_events` rows. Hours saved and Cost saved are intentionally absent:
 * they ship as "Setup needed" placeholder cells until the calculator's task
 * book is promoted from localStorage to the database (a separate sub-arc).
 */
export type TimeframeData = {
  agentRuns: {
    /** Runs in the current window. */
    current: number;
    /** Runs in the comparison window, or null when there's no comparison (YTD). */
    previous: number | null;
    /** Signed current - previous, or null when there's no comparison (YTD). */
    delta: number | null;
    /**
     * Run counts bucketed across the current window, oldest to newest. Length
     * is the natural granularity of the window (days this week, days this
     * month capped at 12, months this year), so it can be 1 early in a
     * window. The Sparkline component handles any length, including 1.
     */
    sparkline: number[];
  };
  topAgent: {
    /** null only when the user has zero runs in the current window. */
    name: string | null;
    runsCurrent: number;
  };
  /**
   * Trailing phrase for the Agent-runs delta, e.g. "vs last week" or
   * "vs April". null for YTD, where no prior-year baseline exists yet.
   */
  comparisonLabel: string | null;
};

/**
 * All three timeframes, pre-fetched in a single server call so the client
 * toggle can swap between them instantly with no further round-trips.
 */
export type ImpactBandData = {
  week: TimeframeData;
  month: TimeframeData;
  ytd: TimeframeData;
};

/** Query plan for one timeframe; resolved windows + presentation metadata. */
type TimeframeQuery = {
  currentStart: Date;
  /** null when the timeframe has no comparison window (YTD). */
  previousStart: Date | null;
  /** null when the timeframe has no comparison window (YTD). */
  previousEnd: Date | null;
  /** Number of sparkline buckets across the current window (>= 1). */
  bucketCount: number;
  comparisonLabel: string | null;
};

/** Pre-name-resolution result for one timeframe. */
type RawTimeframe = {
  current: number;
  previous: number | null;
  sparkline: number[];
  topAgentId: string | null;
  topAgentRuns: number;
  comparisonLabel: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Honest zero-state for one timeframe; used in the error fallback. */
function emptyTimeframe(
  comparisonLabel: string | null,
  bucketCount: number,
): TimeframeData {
  return {
    agentRuns: {
      current: 0,
      previous: null,
      delta: null,
      sparkline: Array<number>(bucketCount).fill(0),
    },
    topAgent: { name: null, runsCurrent: 0 },
    comparisonLabel,
  };
}

/**
 * Safe zero-state returned when any query fails. The band still renders; it
 * just shows honest zeros rather than surfacing an error to the user. Bucket
 * counts mirror the natural full-window granularity so the flat sparklines
 * keep the layout stable.
 */
const EMPTY: ImpactBandData = {
  week: emptyTimeframe("vs last week", 7),
  month: emptyTimeframe(null, 12),
  ytd: emptyTimeframe(null, 12),
};

/**
 * Buckets event timestamps into `count` equal-time slices spanning
 * [startMs, endMs). The window always begins on a calendar boundary and
 * `count` equals the number of elapsed calendar units, so each bucket maps
 * closely to one unit (a day for Week/Month, roughly a month for YTD), with
 * the final bucket honestly representing the current partial unit. The
 * sparkline is decorative (aria-hidden); the headline count and delta carry
 * the precise meaning, so equal-time slicing is a fine, uniform choice.
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

/**
 * Loads one timeframe from `usage_events`.
 *
 * Queries (RLS-scoped via the per-request client; `usage_events_user_reads_own`
 * restricts every read to the caller's own rows, and `.eq("user_id", …)`
 * mirrors it at the app layer):
 *   1. exact current-window run count (HEAD + count)
 *   2. exact comparison-window run count for the delta (skipped for YTD)
 *   3. raw rows over the current window (created_at + agent_id), aggregated in
 *      JS for the sparkline buckets and the top-agent tally
 *
 * The headline counts (1)/(2) use exact HEAD counts, so they stay correct
 * regardless of volume; only the sparkline and top-agent tally read row
 * bodies, capped at the client's default 1000-row ceiling. That ceiling sits
 * comfortably above a single user's run count for Week/Month; for a heavy
 * user's YTD window the tally may undercount beyond 1000 rows, but the
 * headline count stays exact and the sparkline stays representative.
 */
async function loadTimeframe(
  supabase: ServerClient,
  userId: string,
  now: Date,
  cfg: TimeframeQuery,
): Promise<RawTimeframe> {
  const nowIso = now.toISOString();
  const currentStartIso = cfg.currentStart.toISOString();

  const currentCountQuery = supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", currentStartIso)
    .lt("created_at", nowIso);

  const rawRowsQuery = supabase
    .from("usage_events")
    .select("created_at, agent_id")
    .eq("user_id", userId)
    .gte("created_at", currentStartIso)
    .lt("created_at", nowIso);

  const previousCountQuery =
    cfg.previousStart && cfg.previousEnd
      ? supabase
          .from("usage_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", cfg.previousStart.toISOString())
          .lt("created_at", cfg.previousEnd.toISOString())
      : null;

  const [currentRes, rawRes, previousRes] = await Promise.all([
    currentCountQuery,
    rawRowsQuery,
    previousCountQuery ?? Promise.resolve(null),
  ]);

  if (currentRes.error || rawRes.error || (previousRes && previousRes.error)) {
    throw new Error("usage_events read failed");
  }

  const current = currentRes.count ?? 0;
  const previous = previousRes ? (previousRes.count ?? 0) : null;

  const times: number[] = [];
  const runsByAgent = new Map<string, number>();
  for (const row of rawRes.data ?? []) {
    times.push(new Date(row.created_at).getTime());
    if (row.agent_id) {
      runsByAgent.set(row.agent_id, (runsByAgent.get(row.agent_id) ?? 0) + 1);
    }
  }

  const sparkline = bucketCounts(
    times,
    cfg.currentStart.getTime(),
    now.getTime(),
    cfg.bucketCount,
  );

  // Highest count wins; first seen breaks ties deterministically by
  // iteration (insertion) order.
  let topAgentId: string | null = null;
  let topAgentRuns = 0;
  for (const [agentId, runs] of runsByAgent) {
    if (runs > topAgentRuns) {
      topAgentRuns = runs;
      topAgentId = agentId;
    }
  }

  return {
    current,
    previous,
    sparkline,
    topAgentId,
    topAgentRuns,
    comparisonLabel: cfg.comparisonLabel,
  };
}

/**
 * Loads the impact-band data for one user across all three timeframes.
 *
 * Windows are calendar-anchored and computed in UTC: there is no stored
 * `users.timezone`, and this runs server-side, so UTC is the one consistent
 * frame. `Date.UTC` normalizes month/day overflow across year boundaries.
 *   - Week: Monday 00:00 of this week through now. Comparison: the prior
 *     Monday-to-Monday week.
 *   - Month: the 1st 00:00 of this month through now. Comparison: the prior
 *     calendar month.
 *   - YTD: January 1 00:00 of this year through now. No comparison window.
 *
 * All three timeframes are fetched in parallel, then a single batched lookup
 * resolves the (de-duplicated) top-agent names.
 */
export async function getImpactBandData(
  userId: string,
): Promise<ImpactBandData> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const date = now.getUTCDate();

    // Monday-anchored week. getUTCDay is 0 (Sun)..6 (Sat); shift so Monday is 0.
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;

    const weekStart = new Date(Date.UTC(year, month, date - daysSinceMonday));
    const lastWeekStart = new Date(weekStart.getTime() - 7 * MS_PER_DAY);

    const monthStart = new Date(Date.UTC(year, month, 1));
    const prevMonthStart = new Date(Date.UTC(year, month - 1, 1));

    const yearStart = new Date(Date.UTC(year, 0, 1));

    const prevMonthName = new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "UTC",
    }).format(prevMonthStart);

    const weekCfg: TimeframeQuery = {
      currentStart: weekStart,
      previousStart: lastWeekStart,
      previousEnd: weekStart,
      bucketCount: Math.max(1, daysSinceMonday + 1),
      comparisonLabel: "vs last week",
    };
    const monthCfg: TimeframeQuery = {
      currentStart: monthStart,
      previousStart: prevMonthStart,
      previousEnd: monthStart,
      bucketCount: Math.max(1, Math.min(12, date)),
      comparisonLabel: `vs ${prevMonthName}`,
    };
    const ytdCfg: TimeframeQuery = {
      currentStart: yearStart,
      previousStart: null,
      previousEnd: null,
      bucketCount: Math.max(1, month + 1),
      comparisonLabel: null,
    };

    const [weekRaw, monthRaw, ytdRaw] = await Promise.all([
      loadTimeframe(supabase, userId, now, weekCfg),
      loadTimeframe(supabase, userId, now, monthCfg),
      loadTimeframe(supabase, userId, now, ytdCfg),
    ]);

    // One batched name lookup for every distinct top agent across the three
    // windows (the same agent often tops more than one).
    const uniqueIds = Array.from(
      new Set(
        [weekRaw, monthRaw, ytdRaw]
          .map((raw) => raw.topAgentId)
          .filter((id): id is string => id !== null),
      ),
    );
    const nameById = new Map<string, string>();
    if (uniqueIds.length > 0) {
      const { data: agents } = await supabase
        .from("agents")
        .select("id, name")
        .in("id", uniqueIds);
      for (const agent of agents ?? []) {
        nameById.set(agent.id, agent.name ?? "Untitled agent");
      }
    }

    // Name is non-null whenever there are runs, so the band's "no runs"
    // branch only fires on a genuinely empty window. If the agent is no
    // longer readable (access revoked, hard edge case), fall back to the
    // same label ContinueWorking uses rather than dropping the stat.
    const assemble = (raw: RawTimeframe): TimeframeData => ({
      agentRuns: {
        current: raw.current,
        previous: raw.previous,
        delta: raw.previous === null ? null : raw.current - raw.previous,
        sparkline: raw.sparkline,
      },
      topAgent: {
        name: raw.topAgentId
          ? (nameById.get(raw.topAgentId) ?? "Untitled agent")
          : null,
        runsCurrent: raw.topAgentRuns,
      },
      comparisonLabel: raw.comparisonLabel,
    });

    return {
      week: assemble(weekRaw),
      month: assemble(monthRaw),
      ytd: assemble(ytdRaw),
    };
  } catch (err) {
    console.error("getImpactBandData failed", err);
    return EMPTY;
  }
}
