/**
 * Vendor content registry (C4L/platform arc, Step 2) — the version-controlled
 * source of truth for vendor-shipped CONTENT (prebuilt agents that flow INWARD
 * from a vendor), as distinct from connections (which the customer connects
 * OUTWARD to). Today the one provider is Claude for Legal; this module is the
 * seam the multi-vendor registry (Step 4) grows from.
 *
 * Mapping-as-CODE, not a DB table — deliberate, mirroring the trusted MCP-server
 * registry (`lib/connections/providers/mcp-registry.ts`): the placement of
 * vendor content is platform-owner-owned config that ships with the code and is
 * reviewed in PRs, not a row a tenant or a runtime path can mutate. The
 * `pluginDepartmentMap` is the HARD CEILING on where each plugin's agents land.
 *
 * The `pluginDepartmentMap` below was DERIVED FROM LIVE STATE (every C4L agent's
 * `source_origin` plugin → its `department_id` slug, including soft-deleted rows
 * so their intended placement is captured too), so it matches reality exactly
 * rather than memory. The convention is `<plugin>` → the department slug with the
 * `-legal` suffix stripped; all nine targets are real department slugs.
 */

import { siteConfig } from "@/config/site";

/**
 * A vendor that ships curated content (agents) into legalOS departments. The
 * `providerId` matches the `source_origin` prefix the import stamps on each
 * agent (`<providerId>:<plugin>/<skill>`) and the `AgentSourceId` in
 * `lib/agents/source.ts`, so provenance, attribution, and placement all key off
 * the same id.
 */
export type VendorContentProvider = {
  /** Stable id; the `source_origin` prefix (e.g. "claude-for-legal"). */
  providerId: string;
  /** Human-facing attribution label (e.g. "Claude for Legal"). */
  displayLabel: string;
  /**
   * One-line subline under the provider's launchpad section heading,
   * orienting a cold user to what the group is and where it comes from.
   */
  launchpadSubline: string;
  /** The public source repository the content is imported from. */
  sourceRepo: string;
  /**
   * The upstream commit the shipped content was last reconciled against. A
   * runtime refresh reports the live commit it read (C4LRefreshSummary's
   * `sourceCommit`); a session that re-harvests or re-reconciles updates this
   * field in the same change. Recorded so future gap analyses never need git
   * archaeology to learn which upstream state was synced.
   */
  upstreamCommit: string;
  /**
   * The HARD CEILING on placement: each imported plugin slug → the legalOS
   * department slug its agents land in. The import reads placement from here
   * (never from a one-off argument), so a refresh restores placement
   * deterministically. A plugin absent from this map is "uncategorized" and is
   * reported, never guessed into a department (see lib/content/c4l-import.ts).
   */
  pluginDepartmentMap: Record<string, string>;
};

/**
 * Claude for Legal — Anthropic's open-source prebuilt legal agents. Nine plugins
 * were imported (the four deferred per D-051 — law-student, legal-clinic,
 * legal-builder-hub, cocounsel-legal — are intentionally NOT mapped). Each
 * plugin's `skills/<skill>/SKILL.md` becomes one agent.
 */
export const CLAUDE_FOR_LEGAL: VendorContentProvider = {
  providerId: "claude-for-legal",
  displayLabel: "Claude for Legal",
  launchpadSubline: "A curated library of Anthropic’s legal agents, ready to use.",
  sourceRepo: "https://github.com/anthropics/claude-for-legal",
  // Backfilled at the connector-catalog harvest (2026-06-10): the upstream HEAD
  // read for the C4L gap analysis and the connector harvest.
  upstreamCommit: "248331e0fedd76418edd8b46ca895518f9a009ce",
  pluginDepartmentMap: {
    "ai-governance-legal": "ai-governance",
    "commercial-legal": "commercial",
    "corporate-legal": "corporate",
    "employment-legal": "employment",
    "ip-legal": "ip",
    "litigation-legal": "litigation",
    "privacy-legal": "privacy",
    "product-legal": "product",
    "regulatory-legal": "regulatory",
  },
};

/**
 * The built-in first-party agent tier (D-180/D-181, brand-decoupled in D-182).
 * Free, fully-locked agents seeded into departments. It shares the provider
 * SHAPE (for the importer's plugin -> department map and for label/subline
 * resolution), but is DELIBERATELY ABSENT from `VENDOR_CONTENT_PROVIDERS` and
 * `VENDOR_PROVIDER_ORDER`: this tier is ALWAYS ON, never org-disableable, so it
 * must not appear in the admin content-providers policy editor (which iterates
 * `VENDOR_CONTENT_PROVIDERS`) and must not be gated by vendor-content settings.
 * The launchpad includes its group unconditionally (see `getAgentsForDepartment‑
 * Launchpad`), and label/subline resolution special-cases it (see
 * `lib/agents/source.ts`). The internal token is the brand-neutral `builtin`
 * (D-182): tag form `builtin:tools/<skill>` (the parser requires a slash;
 * `builtin:tools` alone would parse to null), slug form `builtin-<skill>`.
 * NOTHING here hardcodes the product name: the label/subline DERIVE from
 * `siteConfig.siteTitle`, so a rename touches no data and no tier code.
 */
export const BUILTIN_PROVIDER: VendorContentProvider = {
  providerId: "builtin",
  // DERIVED from siteConfig (no hardcoded product name); source.ts re-derives
  // these live at call time for display. See the JSDoc above.
  displayLabel: `Powered by ${siteConfig.siteTitle}`,
  launchpadSubline: `Free agents built into ${siteConfig.siteTitle}. Copy one to make it your own.`,
  sourceRepo: "",
  upstreamCommit: "",
  pluginDepartmentMap: { tools: "general-tools" },
};

/** The `source_origin` prefix for the built-in tier (`builtin:tools/<skill>`). */
export const BUILTIN_SOURCE_ID = BUILTIN_PROVIDER.providerId;

/** Every vendor content provider, keyed by providerId. Step 4 grows this.
 *  NOTE: the legalOS system tier is intentionally NOT here (always-on, not a
 *  disableable vendor). */
export const VENDOR_CONTENT_PROVIDERS: Record<string, VendorContentProvider> = {
  [CLAUDE_FOR_LEGAL.providerId]: CLAUDE_FOR_LEGAL,
};

/** A registered provider by id, or undefined for an unknown source. */
export function getVendorProvider(
  providerId: string,
): VendorContentProvider | undefined {
  return VENDOR_CONTENT_PROVIDERS[providerId];
}

/**
 * Registered provider ids in registry (insertion) order. The launchpad renders
 * each vendor's section in this order, so the ordering of content sections is
 * data-driven from one place.
 */
export const VENDOR_PROVIDER_ORDER: readonly string[] = Object.keys(
  VENDOR_CONTENT_PROVIDERS,
);
