import type { InsightsData } from "./insights-math";

/**
 * Representative SAMPLE dataset for the Insights demo toggle (A4a).
 *
 * A well-shaped fixture — a plausible spread of native-agent runs across users,
 * agents, departments, and models over week / month / YTD windows — so the
 * Insights experience can be shown before an org has accrued real usage. It is
 * the SAME `InsightsData` shape `getOrgInsights` returns, so it flows through the
 * exact same rendering; only the numbers differ. It is always rendered behind a
 * visible "Sample data" label so it can never be mistaken for real measured data.
 *
 * Type-only import of `InsightsData` keeps this module free of the server-only
 * query code, so the client view can import the fixture directly.
 *
 * Deliberately illustrative, not derived from any real org. Department / agent /
 * model labels match the product's real vocabulary so the demo reads true.
 */
export const SAMPLE_INSIGHTS: InsightsData = {
  week: {
    runs: {
      current: 86,
      previous: 71,
      delta: 15,
      comparisonLabel: "vs last week",
      sparkline: [9, 12, 14, 11, 18, 13, 9],
    },
    activeUsers: 11,
    byAgent: [
      { id: "a1", label: "Contract Review Assistant", runs: 24 },
      { id: "a2", label: "NDA Drafter", runs: 18 },
      { id: "a3", label: "Privacy Impact Assessor", runs: 13 },
      { id: "a4", label: "Regulatory Research", runs: 11 },
      { id: "a5", label: "Employment Policy Checker", runs: 9 },
      { id: "a6", label: "Litigation Summarizer", runs: 7 },
    ],
    byDepartment: [
      { id: "d1", label: "Commercial", runs: 38 },
      { id: "d2", label: "Privacy", runs: 17 },
      { id: "d3", label: "Regulatory", runs: 14 },
      { id: "d4", label: "Employment", runs: 10 },
      { id: "d5", label: "Litigation", runs: 7 },
    ],
    byModel: [
      { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", runs: 52 },
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", runs: 28 },
      { id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", runs: 6 },
    ],
    byUser: [
      { id: "u1", label: "Dana Whitfield", runs: 19 },
      { id: "u2", label: "Marcus Lee", runs: 15 },
      { id: "u3", label: "Priya Anand", runs: 13 },
      { id: "u4", label: "Tom Becker", runs: 11 },
      { id: "u5", label: "Sofia Ramirez", runs: 9 },
      { id: "u6", label: "Jordan Park", runs: 8 },
    ],
  },
  month: {
    runs: {
      current: 342,
      previous: 286,
      delta: 56,
      comparisonLabel: "vs April",
      sparkline: [18, 22, 26, 21, 28, 31, 27, 34, 29, 33, 38, 35],
    },
    activeUsers: 14,
    byAgent: [
      { id: "a1", label: "Contract Review Assistant", runs: 96 },
      { id: "a2", label: "NDA Drafter", runs: 74 },
      { id: "a3", label: "Privacy Impact Assessor", runs: 51 },
      { id: "a4", label: "Regulatory Research", runs: 44 },
      { id: "a5", label: "Employment Policy Checker", runs: 38 },
      { id: "a6", label: "Litigation Summarizer", runs: 23 },
      { id: "a7", label: "IP Filing Helper", runs: 16 },
    ],
    byDepartment: [
      { id: "d1", label: "Commercial", runs: 170 },
      { id: "d2", label: "Privacy", runs: 62 },
      { id: "d3", label: "Regulatory", runs: 51 },
      { id: "d4", label: "Employment", runs: 38 },
      { id: "d5", label: "Litigation", runs: 23 },
    ],
    byModel: [
      { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", runs: 198 },
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", runs: 121 },
      { id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", runs: 23 },
    ],
    byUser: [
      { id: "u1", label: "Dana Whitfield", runs: 64 },
      { id: "u2", label: "Marcus Lee", runs: 58 },
      { id: "u3", label: "Priya Anand", runs: 47 },
      { id: "u4", label: "Tom Becker", runs: 41 },
      { id: "u5", label: "Sofia Ramirez", runs: 35 },
      { id: "u6", label: "Jordan Park", runs: 29 },
      { id: "u7", label: "Elena Cho", runs: 22 },
    ],
  },
  ytd: {
    runs: {
      current: 2148,
      previous: null,
      delta: null,
      comparisonLabel: null,
      sparkline: [96, 142, 178, 205, 342],
    },
    activeUsers: 17,
    byAgent: [
      { id: "a1", label: "Contract Review Assistant", runs: 612 },
      { id: "a2", label: "NDA Drafter", runs: 437 },
      { id: "a3", label: "Privacy Impact Assessor", runs: 318 },
      { id: "a4", label: "Regulatory Research", runs: 264 },
      { id: "a5", label: "Employment Policy Checker", runs: 221 },
      { id: "a6", label: "Litigation Summarizer", runs: 158 },
      { id: "a7", label: "IP Filing Helper", runs: 96 },
      { id: "a8", label: "Corporate Filings Assistant", runs: 42 },
    ],
    byDepartment: [
      { id: "d1", label: "Commercial", runs: 1049 },
      { id: "d2", label: "Privacy", runs: 318 },
      { id: "d3", label: "Regulatory", runs: 264 },
      { id: "d4", label: "Employment", runs: 221 },
      { id: "d5", label: "Litigation", runs: 158 },
      { id: "d6", label: "Corporate", runs: 138 },
    ],
    byModel: [
      { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", runs: 1198 },
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", runs: 812 },
      { id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", runs: 138 },
    ],
    byUser: [
      { id: "u1", label: "Dana Whitfield", runs: 392 },
      { id: "u2", label: "Marcus Lee", runs: 348 },
      { id: "u3", label: "Priya Anand", runs: 291 },
      { id: "u4", label: "Tom Becker", runs: 256 },
      { id: "u5", label: "Sofia Ramirez", runs: 214 },
      { id: "u6", label: "Jordan Park", runs: 187 },
      { id: "u7", label: "Elena Cho", runs: 142 },
      { id: "u8", label: "Wesley Kerr", runs: 118 },
    ],
  },
  agents: { total: 11, unused: 3 },
};
