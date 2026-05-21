/**
 * Helpers for parsing the `source_origin` field on agents.
 *
 * `source_origin` is a text column with one of two shapes:
 *   - NULL — legalOS-native agent (Canonical template or Personal)
 *   - "<source-id>:<plugin>/<skill>" — externally-sourced agent
 *
 * The prefix before the colon identifies the source for UI attribution
 * ("Claude for Legal", future "Stanford CodeX", etc.). The path after
 * the colon identifies the specific upstream item, used by the sync
 * pipeline to match imported rows to their upstream definitions.
 */

export type AgentSourceId = "claude-for-legal";
// Future source ids extend this union: "claude-for-legal" | "stanford-codex" | ...

export interface ParsedSourceOrigin {
  /** The source identifier (e.g. "claude-for-legal"). */
  sourceId: AgentSourceId;
  /** The plugin name within the source (e.g. "commercial-legal"). */
  plugin: string;
  /** The skill or item name within the plugin (e.g. "vendor-agreement-review"). */
  skill: string;
}

/**
 * Display label for an agent source. Renders the attribution badge text
 * on agent cards.
 */
const SOURCE_DISPLAY_LABELS: Record<AgentSourceId, string> = {
  "claude-for-legal": "Claude for Legal",
};

/**
 * Parse a `source_origin` string into its structured components.
 * Returns null if the input is null, empty, or malformed (unknown
 * source id, missing colon, missing slash, or empty segments).
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

  if (!plugin || !skill) return null;
  if (!isKnownSourceId(sourceId)) return null;

  return { sourceId, plugin, skill };
}

function isKnownSourceId(value: string): value is AgentSourceId {
  return value in SOURCE_DISPLAY_LABELS;
}

/**
 * Get the human-readable display label for a parsed source.
 * Used in UI attribution badges.
 */
export function getSourceDisplayLabel(sourceId: AgentSourceId): string {
  return SOURCE_DISPLAY_LABELS[sourceId];
}

/**
 * Convenience: parse a raw source_origin and get the display label in
 * one step. Returns null if the input is null or malformed.
 */
export function getDisplayLabelFromOrigin(raw: string | null): string | null {
  const parsed = parseSourceOrigin(raw);
  return parsed ? getSourceDisplayLabel(parsed.sourceId) : null;
}
