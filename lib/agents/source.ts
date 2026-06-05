import {
  getVendorProvider,
  VENDOR_PROVIDER_ORDER,
} from "@/lib/content/vendor-registry";

/**
 * Helpers for the `source_origin` field on agents — provenance + the
 * vendor-agnostic source split (C4L/platform arc Step 4).
 *
 * `source_origin` is a text column with one of two shapes:
 *   - NULL — legalOS-native agent (Canonical template or Personal)
 *   - "<source-id>:<plugin>/<skill>" — externally-sourced (vendor) agent
 *
 * The prefix before the colon is the source/vendor id; the path after it
 * identifies the upstream item. The vendor-content registry
 * (`lib/content/vendor-registry.ts`) is the SINGLE SOURCE OF TRUTH for which
 * providers exist and their display labels — these helpers read from it rather
 * than keeping a second list, so adding a provider is one registry edit.
 */

/**
 * A source/vendor id (the `source_origin` prefix). Open `string`, not a closed
 * union: vendors are extensible, and the KNOWN ones live in the registry. An id
 * not in the registry still groups and labels gracefully (humanized fallback).
 */
export type AgentSourceId = string;

export interface ParsedSourceOrigin {
  /** The source/vendor id (e.g. "claude-for-legal"). */
  sourceId: AgentSourceId;
  /** The plugin name within the source (e.g. "commercial-legal"). */
  plugin: string;
  /** The skill or item name within the plugin (e.g. "vendor-agreement-review"). */
  skill: string;
}

/** The pre-Step-4 single external section persisted collapse state here. */
const LEGACY_EXTERNAL_SECTION_KEY = "externalAgents";
/** The legacy single vendor; keeps the legacy collapse key for back-compat. */
const LEGACY_SOURCE_ID = "claude-for-legal";

/** Title-case a raw source id for an unknown provider: "stanford-codex" → "Stanford Codex". */
function humanizeSourceId(sourceId: string): string {
  const titled = sourceId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return titled || sourceId;
}

/**
 * Parse a `source_origin` string into its structured components. Accepts ANY
 * non-empty source id (not only registered ones) so a vendor whose registry
 * entry hasn't landed yet still attributes; returns null only when the SHAPE is
 * invalid (empty, missing colon, missing slash, or empty segments).
 */
export function parseSourceOrigin(
  raw: string | null,
): ParsedSourceOrigin | null {
  if (!raw || raw.trim() === "") return null;

  const colonIdx = raw.indexOf(":");
  if (colonIdx <= 0 || colonIdx === raw.length - 1) return null;

  const sourceId = raw.slice(0, colonIdx).trim();
  const path = raw.slice(colonIdx + 1).trim();

  const slashIdx = path.indexOf("/");
  if (slashIdx <= 0 || slashIdx === path.length - 1) return null;

  const plugin = path.slice(0, slashIdx).trim();
  const skill = path.slice(slashIdx + 1).trim();

  if (!sourceId || !plugin || !skill) return null;

  return { sourceId, plugin, skill };
}

/**
 * The source/vendor id for GROUPING — the prefix before the first colon, robust
 * to a malformed remainder (so every non-null `source_origin` lands in some
 * group and none silently vanish). For a well-formed origin this equals
 * `parseSourceOrigin(...).sourceId`.
 */
export function extractSourceId(rawSourceOrigin: string): string {
  const colonIdx = rawSourceOrigin.indexOf(":");
  const prefix = colonIdx > 0 ? rawSourceOrigin.slice(0, colonIdx) : rawSourceOrigin;
  return prefix.trim();
}

/**
 * The human-readable display label for a source id — the registry's label when
 * the provider is registered, else a humanized fallback. Used for attribution
 * badges and the launchpad's per-vendor section titles.
 */
export function getSourceDisplayLabel(sourceId: AgentSourceId): string {
  return getVendorProvider(sourceId)?.displayLabel ?? humanizeSourceId(sourceId);
}

/**
 * Convenience: parse a raw source_origin and get the display label in one step.
 * Returns null if the input is null or malformed.
 */
export function getDisplayLabelFromOrigin(raw: string | null): string | null {
  const parsed = parseSourceOrigin(raw);
  return parsed ? getSourceDisplayLabel(parsed.sourceId) : null;
}

/**
 * The per-department collapse-state key for a vendor's launchpad section. The
 * original single external section persisted under "externalAgents", so the
 * legacy vendor (claude-for-legal) keeps that key — existing user collapse
 * preferences survive the split into per-vendor sections. New vendors get their
 * own namespaced key, independent of each other.
 */
export function externalCollapseSectionKey(sourceId: string): string {
  return sourceId === LEGACY_SOURCE_ID
    ? LEGACY_EXTERNAL_SECTION_KEY
    : `external:${sourceId}`;
}

/** A vendor's group of external agents for the launchpad. */
export type ExternalAgentGroup<T> = {
  sourceId: string;
  displayLabel: string;
  agents: T[];
};

/**
 * Group external agents by their source/vendor id (C4L/platform arc Step 4),
 * so each vendor renders as its own section. Pure and generic. Groups are
 * ordered by `providerOrder` (registered providers first, in registry order),
 * then any unregistered source ids alphabetically; agent order WITHIN a group is
 * preserved (the caller pre-sorts). Agents with a null source_origin are
 * skipped. With one vendor present this yields exactly one group — the
 * single-vendor case is behavior-identical to the old single bucket.
 */
export function groupAgentsBySource<T extends { source_origin: string | null }>(
  agents: T[],
  providerOrder: readonly string[] = VENDOR_PROVIDER_ORDER,
): ExternalAgentGroup<T>[] {
  const bySource = new Map<string, T[]>();
  for (const agent of agents) {
    if (agent.source_origin === null) continue;
    const sourceId = extractSourceId(agent.source_origin);
    if (!sourceId) continue;
    const existing = bySource.get(sourceId);
    if (existing) existing.push(agent);
    else bySource.set(sourceId, [agent]);
  }

  const orderIndex = new Map(providerOrder.map((id, i) => [id, i]));
  const sortedIds = [...bySource.keys()].sort((a, b) => {
    const ai = orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.localeCompare(b);
  });

  return sortedIds.map((sourceId) => ({
    sourceId,
    displayLabel: getSourceDisplayLabel(sourceId),
    agents: bySource.get(sourceId)!,
  }));
}
