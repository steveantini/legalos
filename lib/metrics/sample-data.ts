/**
 * Sample-data fixtures for the adoption metrics surface. Adapted from
 * agent-launchpad-template/admin.html (lines 1735–1757, 2002–2204,
 * 2269–2306) under D-019 (Constraint C) and D-021. Behavioral structure
 * matches the source verbatim. Two adaptations from the source bytes,
 * both content-only (not behavior):
 *
 * 1. Agent names. Ten total — six from the seeded Commercial department
 *    and four invented for M&A / Privacy / GR&RA / Public Sector.
 *    Demonstrates the dashboard against this project's real surface;
 *    agents that don't exist on the launchpad would be more confusing
 *    than helpful in a demo.
 * 2. Procedural fixtures (`userInteractionData`, `agentUsageData`) use
 *    a deterministic seeded PRNG (`mulberry32(42)`) and compute once at
 *    module import. Same shape as the source, fixed across page reloads.
 *    The source called `Math.random()` at module load each time — a
 *    bug, not a feature.
 *
 * Reference date `SAMPLE_AS_OF` anchors all generated dates so the
 * fixture is bit-for-bit reproducible regardless of when the module
 * loads. Bump the constant to refresh the demo's "as of" framing.
 *
 * Sized to align with `topUsersData[period].interactions`. The source
 * mis-sized year arrays at month counts (sarah's "year" had 187 rows
 * instead of 2145) — sensible alignment, not behavior parity.
 */

import type {
  ClicksRow,
  InteractionRow,
  Period,
  TopUserRow,
  UsageRow,
} from "./types";

const SAMPLE_AS_OF = "2026-04-15";

/**
 * Ten sample agents — order is descending click rank. Enterprise
 * Agreement Review is the flagship, mirroring the source's Contract
 * Review Agent at rank 1.
 */
export const SAMPLE_AGENTS = [
  "Enterprise Agreement Review",
  "Mutual NDA Review",
  "Vendor Agreement Review",
  "Order Form & SOW Review",
  "Due Diligence Assistant",
  "Data Processing Addendum (DPA) Review",
  "AI Addendum Review",
  "Privacy Notice Review",
  "Regulatory Filing Assistant",
  "Public Records Request Triage",
] as const;

/** Five sample users — verbatim from the source (lines 990–1014, 2162). */
export const SAMPLE_USERS = [
  "sarah.chen@yourcompany.com",
  "james.oconnor@yourcompany.com",
  "priya.patel@yourcompany.com",
  "david.kim@yourcompany.com",
  "maria.santos@yourcompany.com",
] as const;

/**
 * Per-user agent pools, mirroring the source's sampleAgents /
 * sampleAgents2 / sampleAgents3 + inline arrays. Each user's most-used
 * agent (in `topUsersData` below) is in their own pool — same constraint
 * as the source.
 */
const userAgentPools: Record<string, readonly string[]> = {
  "sarah.chen@yourcompany.com": [
    "Enterprise Agreement Review",
    "Mutual NDA Review",
    "Due Diligence Assistant",
    "Order Form & SOW Review",
  ],
  "james.oconnor@yourcompany.com": [
    "Regulatory Filing Assistant",
    "Vendor Agreement Review",
    "Data Processing Addendum (DPA) Review",
  ],
  "priya.patel@yourcompany.com": [
    "Mutual NDA Review",
    "Order Form & SOW Review",
    "AI Addendum Review",
  ],
  "david.kim@yourcompany.com": [
    "Due Diligence Assistant",
    "Enterprise Agreement Review",
  ],
  "maria.santos@yourcompany.com": [
    "Due Diligence Assistant",
    "Mutual NDA Review",
    "Data Processing Addendum (DPA) Review",
  ],
};

/**
 * Weighted user list for `agentUsageData` random user picks. Source's
 * `users` array (line 2162) duplicates sarah and james — 2/7 weight
 * each, others 1/7. Preserved verbatim.
 */
const weightedUsers: readonly string[] = [
  "sarah.chen@yourcompany.com",
  "james.oconnor@yourcompany.com",
  "priya.patel@yourcompany.com",
  "david.kim@yourcompany.com",
  "maria.santos@yourcompany.com",
  "sarah.chen@yourcompany.com",
  "james.oconnor@yourcompany.com",
];

// ─────────────────────────────────────────────────────────────────────
// Top users — hand-written, three periods × five rows each.
// Counts and rank order verbatim from source lines 1735–1757; only the
// "most-used agent" field is substituted per the agent-name adaptation.
// ─────────────────────────────────────────────────────────────────────

export const topUsersData: Record<Period, TopUserRow[]> = {
  week: [
    { rank: 1, user: "sarah.chen@yourcompany.com",    interactions: 45, agent: "Enterprise Agreement Review" },
    { rank: 2, user: "james.oconnor@yourcompany.com", interactions: 38, agent: "Regulatory Filing Assistant" },
    { rank: 3, user: "priya.patel@yourcompany.com",   interactions: 32, agent: "Mutual NDA Review" },
    { rank: 4, user: "david.kim@yourcompany.com",     interactions: 24, agent: "Due Diligence Assistant" },
    { rank: 5, user: "maria.santos@yourcompany.com",  interactions: 21, agent: "Data Processing Addendum (DPA) Review" },
  ],
  month: [
    { rank: 1, user: "sarah.chen@yourcompany.com",    interactions: 187, agent: "Enterprise Agreement Review" },
    { rank: 2, user: "james.oconnor@yourcompany.com", interactions: 154, agent: "Regulatory Filing Assistant" },
    { rank: 3, user: "priya.patel@yourcompany.com",   interactions: 132, agent: "Mutual NDA Review" },
    { rank: 4, user: "david.kim@yourcompany.com",     interactions:  98, agent: "Due Diligence Assistant" },
    { rank: 5, user: "maria.santos@yourcompany.com",  interactions:  87, agent: "Data Processing Addendum (DPA) Review" },
  ],
  year: [
    { rank: 1, user: "sarah.chen@yourcompany.com",    interactions: 2145, agent: "Enterprise Agreement Review" },
    { rank: 2, user: "james.oconnor@yourcompany.com", interactions: 1876, agent: "Regulatory Filing Assistant" },
    { rank: 3, user: "priya.patel@yourcompany.com",   interactions: 1654, agent: "Mutual NDA Review" },
    { rank: 4, user: "david.kim@yourcompany.com",     interactions: 1243, agent: "Due Diligence Assistant" },
    { rank: 5, user: "maria.santos@yourcompany.com",  interactions: 1098, agent: "Data Processing Addendum (DPA) Review" },
  ],
};

// ─────────────────────────────────────────────────────────────────────
// Clicks per agent — hand-written, three periods × ten rows each.
// Click magnitudes verbatim from source lines 2269–2306 (week 342→75,
// month 1420→320, year 16850→3840 — same descending shape); only agent
// labels are substituted.
// ─────────────────────────────────────────────────────────────────────

export const clicksData: Record<Period, ClicksRow[]> = {
  week: [
    { label: "Enterprise Agreement Review",           value:  342 },
    { label: "Mutual NDA Review",                     value:  281 },
    { label: "Vendor Agreement Review",               value:  243 },
    { label: "Order Form & SOW Review",               value:  222 },
    { label: "Due Diligence Assistant",               value:  182 },
    { label: "Data Processing Addendum (DPA) Review", value:  161 },
    { label: "AI Addendum Review",                    value:  140 },
    { label: "Privacy Notice Review",                 value:  119 },
    { label: "Regulatory Filing Assistant",           value:   96 },
    { label: "Public Records Request Triage",         value:   75 },
  ],
  month: [
    { label: "Enterprise Agreement Review",           value: 1420 },
    { label: "Mutual NDA Review",                     value: 1180 },
    { label: "Vendor Agreement Review",               value: 1050 },
    { label: "Order Form & SOW Review",               value:  920 },
    { label: "Due Diligence Assistant",               value:  780 },
    { label: "Data Processing Addendum (DPA) Review", value:  690 },
    { label: "AI Addendum Review",                    value:  580 },
    { label: "Privacy Notice Review",                 value:  490 },
    { label: "Regulatory Filing Assistant",           value:  410 },
    { label: "Public Records Request Triage",         value:  320 },
  ],
  year: [
    { label: "Enterprise Agreement Review",           value: 16850 },
    { label: "Mutual NDA Review",                     value: 14200 },
    { label: "Vendor Agreement Review",               value: 12600 },
    { label: "Order Form & SOW Review",               value: 10980 },
    { label: "Due Diligence Assistant",               value:  9340 },
    { label: "Data Processing Addendum (DPA) Review", value:  8280 },
    { label: "AI Addendum Review",                    value:  6960 },
    { label: "Privacy Notice Review",                 value:  5880 },
    { label: "Regulatory Filing Assistant",           value:  4920 },
    { label: "Public Records Request Triage",         value:  3840 },
  ],
};

// ─────────────────────────────────────────────────────────────────────
// PRNG — mulberry32. Deterministic, dependency-free.
// All procedural fixtures share one PRNG instance with seed=42; draws
// happen once at module import. Order of draws determines the full
// procedural state — moving a draw shifts everything after it.
// ─────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);
const rint = (max: number) => Math.floor(rng() * max);
const rbool = () => rng() > 0.5;

// ─────────────────────────────────────────────────────────────────────
// Date / time helpers. SAMPLE_AS_OF anchors the fixture; offset days
// back from there for week/month/year buckets.
// ─────────────────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365 };
const ASOF_MS = Date.parse(SAMPLE_AS_OF + "T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function dateForPeriod(period: Period): string {
  const days = rint(PERIOD_DAYS[period]);
  return new Date(ASOF_MS - days * DAY_MS).toISOString().slice(0, 10);
}

function timeOfDay(): string {
  const hour = String(rint(12) + 1).padStart(2, "0");
  const minute = String(rint(60)).padStart(2, "0");
  const ampm = rbool() ? "AM" : "PM";
  return `${hour}:${minute} ${ampm}`;
}

function pickFromPool(pool: readonly string[]): string {
  return pool[rint(pool.length)];
}

// ─────────────────────────────────────────────────────────────────────
// User interaction data. Per-user × per-period arrays of {date, time,
// agent}. Sized to match topUsersData[period].interactions (the source
// mis-sized year arrays at month counts; corrected here per the
// data-content rationale at the top of this file).
// ─────────────────────────────────────────────────────────────────────

function generateInteractionRows(
  user: string,
  count: number,
  period: Period,
): InteractionRow[] {
  const pool = userAgentPools[user] ?? SAMPLE_AGENTS;
  return Array.from({ length: count }, () => ({
    date: dateForPeriod(period),
    time: timeOfDay(),
    agent: pickFromPool(pool),
  }));
}

export const userInteractionData: Record<
  string,
  Record<Period, InteractionRow[]>
> = Object.fromEntries(
  SAMPLE_USERS.map((user) => {
    const userWeek =
      topUsersData.week.find((r) => r.user === user)?.interactions ?? 0;
    const userMonth =
      topUsersData.month.find((r) => r.user === user)?.interactions ?? 0;
    const userYear =
      topUsersData.year.find((r) => r.user === user)?.interactions ?? 0;
    return [
      user,
      {
        week: generateInteractionRows(user, userWeek, "week"),
        month: generateInteractionRows(user, userMonth, "month"),
        year: generateInteractionRows(user, userYear, "year"),
      },
    ];
  }),
);

// ─────────────────────────────────────────────────────────────────────
// Agent usage data. Per-agent × per-period arrays of {date, time, user}.
// Source (lines 2164–2204): leader (Contract Review) explicit at
// 45/150/500; others random (week 20–49, month 50–149, year 100–399).
// We preserve the leader-explicit / others-random pattern; the leader
// is our flagship Enterprise Agreement Review.
// ─────────────────────────────────────────────────────────────────────

function generateUsageRows(count: number, period: Period): UsageRow[] {
  return Array.from({ length: count }, () => ({
    date: dateForPeriod(period),
    time: timeOfDay(),
    user: weightedUsers[rint(weightedUsers.length)],
  }));
}

export const agentUsageData: Record<string, Record<Period, UsageRow[]>> = {};

agentUsageData[SAMPLE_AGENTS[0]] = {
  week: generateUsageRows(45, "week"),
  month: generateUsageRows(150, "month"),
  year: generateUsageRows(500, "year"),
};

SAMPLE_AGENTS.slice(1).forEach((agent) => {
  agentUsageData[agent] = {
    week: generateUsageRows(rint(30) + 20, "week"),
    month: generateUsageRows(rint(100) + 50, "month"),
    year: generateUsageRows(rint(300) + 100, "year"),
  };
});
