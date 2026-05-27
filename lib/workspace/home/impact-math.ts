import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Data shape for the workspace home impact band (Stage 3). Only the two
 * cells backed by real data are modeled here: Agent runs and Top agent,
 * both sourced from the user's `usage_events` rows. Hours saved and Cost
 * saved are intentionally absent — they ship as "Setup needed" placeholder
 * cells until the calculator's task book is promoted from localStorage to
 * the database (a separate sub-arc). When that lands, this type expands and
 * the placeholder cells flip to real data.
 */
export type ImpactBandData = {
  /** Short month name for the band header, e.g. "May". UTC-derived. */
  monthLabel: string;
  agentRuns: {
    thisMonth: number;
    prevMonth: number;
    /** Signed: thisMonth - prevMonth. */
    delta: number;
    /** Length 12, oldest to newest; each entry is that day's run count. */
    last12DaysSparkline: number[];
  };
  topAgent: {
    /** null only when the user has zero runs this month. */
    name: string | null;
    runsThisMonth: number;
  };
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SPARKLINE_DAYS = 12;

/**
 * Safe zero-state returned when any query fails. The cards still render;
 * they just show honest zeros rather than surfacing an error to the user.
 */
const EMPTY: ImpactBandData = {
  monthLabel: "—",
  agentRuns: {
    thisMonth: 0,
    prevMonth: 0,
    delta: 0,
    last12DaysSparkline: Array<number>(SPARKLINE_DAYS).fill(0),
  },
  topAgent: { name: null, runsThisMonth: 0 },
};

/**
 * Loads the impact-band data for one user from `usage_events`.
 *
 * All windows are computed in UTC: there is no stored `users.timezone`,
 * and this runs server-side, so UTC is the one consistent frame (the
 * `monthLabel` is formatted in UTC too, so the label always matches the
 * month the counts cover). Calendar-month boundaries use `Date.UTC`, which
 * normalizes month overflow/underflow across year boundaries.
 *
 * Queries (RLS-scoped via the per-request client; `usage_events_user_reads_own`
 * restricts every read to the caller's own rows, and `.eq("user_id", …)`
 * mirrors it at the app layer):
 *   1. exact this-month run count (HEAD + count)
 *   2. exact previous-month run count, for the delta
 *   3. raw rows over the last 12 UTC days, bucketed per day for the sparkline
 *   4. raw agent_id rows this month, tallied for the top agent, then one
 *      lookup for that agent's name
 *
 * Approach (3)/(4) fetch raw rows and aggregate in JS rather than via an
 * RPC/SQL group-by — the per-user volume is small at current scale and a
 * migration-free path keeps this stage self-contained. The headline counts
 * (1)/(2) use exact HEAD counts, so they stay correct regardless of volume;
 * only the sparkline and top-agent tally read row bodies (capped at the
 * client's default 1000-row ceiling, comfortably above a single user's
 * monthly run count today).
 */
export async function getImpactBandData(
  userId: string,
): Promise<ImpactBandData> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    const thisMonthStart = new Date(Date.UTC(year, month, 1));
    const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));
    const prevMonthStart = new Date(Date.UTC(year, month - 1, 1));

    // UTC midnight today, then 11 days back = the 12-day window start
    // (today plus the 11 prior days, inclusive).
    const todayStart = new Date(Date.UTC(year, month, now.getUTCDate()));
    const sparklineStart = new Date(
      todayStart.getTime() - (SPARKLINE_DAYS - 1) * MS_PER_DAY,
    );

    const [thisMonthRes, prevMonthRes, sparklineRes, topAgentRes] =
      await Promise.all([
        supabase
          .from("usage_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", thisMonthStart.toISOString())
          .lt("created_at", nextMonthStart.toISOString()),
        supabase
          .from("usage_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", prevMonthStart.toISOString())
          .lt("created_at", thisMonthStart.toISOString()),
        supabase
          .from("usage_events")
          .select("created_at")
          .eq("user_id", userId)
          .gte("created_at", sparklineStart.toISOString()),
        supabase
          .from("usage_events")
          .select("agent_id")
          .eq("user_id", userId)
          .gte("created_at", thisMonthStart.toISOString())
          .lt("created_at", nextMonthStart.toISOString()),
      ]);

    if (
      thisMonthRes.error ||
      prevMonthRes.error ||
      sparklineRes.error ||
      topAgentRes.error
    ) {
      throw new Error("usage_events read failed");
    }

    const thisMonth = thisMonthRes.count ?? 0;
    const prevMonth = prevMonthRes.count ?? 0;

    // Bucket the last 12 days. Rows older than the window are already
    // excluded by the query; defensively clamp to [0, 11].
    const sparkline = Array<number>(SPARKLINE_DAYS).fill(0);
    for (const row of sparklineRes.data ?? []) {
      const dayIndex = Math.floor(
        (new Date(row.created_at).getTime() - sparklineStart.getTime()) /
          MS_PER_DAY,
      );
      if (dayIndex >= 0 && dayIndex < SPARKLINE_DAYS) sparkline[dayIndex] += 1;
    }

    // Tally runs per agent this month; the highest count wins (first seen
    // breaks ties deterministically by iteration order).
    const runsByAgent = new Map<string, number>();
    for (const row of topAgentRes.data ?? []) {
      runsByAgent.set(row.agent_id, (runsByAgent.get(row.agent_id) ?? 0) + 1);
    }
    let topAgentId: string | null = null;
    let topAgentRuns = 0;
    for (const [agentId, runs] of runsByAgent) {
      if (runs > topAgentRuns) {
        topAgentRuns = runs;
        topAgentId = agentId;
      }
    }

    let topAgent: ImpactBandData["topAgent"] = { name: null, runsThisMonth: 0 };
    if (topAgentId) {
      const { data: agent } = await supabase
        .from("agents")
        .select("name")
        .eq("id", topAgentId)
        .maybeSingle();
      // Name is non-null whenever there are runs, so the band's "no runs"
      // branch only fires on a genuinely empty month. If the agent is no
      // longer readable (access revoked, hard edge case), fall back to the
      // same label ContinueWorking uses rather than dropping the stat.
      topAgent = {
        name: agent?.name ?? "Untitled agent",
        runsThisMonth: topAgentRuns,
      };
    }

    const monthLabel = new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(now);

    return {
      monthLabel,
      agentRuns: {
        thisMonth,
        prevMonth,
        delta: thisMonth - prevMonth,
        last12DaysSparkline: sparkline,
      },
      topAgent,
    };
  } catch (err) {
    console.error("getImpactBandData failed", err);
    return EMPTY;
  }
}
