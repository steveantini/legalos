/**
 * Native workflow actions (watcher arc, Stage 2, D-221) — the PURE identity of
 * legalOS-internal deterministic effects a workflow can perform, kept separate
 * from the server-only implementation (`native-actions.ts`) so the constants can
 * be imported by pure/client-safe modules (e.g. `templates.ts`) with no server
 * dependency, mirroring the repo's `*-shared.ts` split.
 *
 * A native action is dispatched INLINE inside a `tool_action` step — never routed
 * to an MCP server — recognised by a reserved `serverId`, exactly as the chat
 * loop's `research_collections` native tool dispatches before the MCP routing map
 * (lib/knowledge/research/inline.ts). It is a legalOS-INTERNAL effect (writing an
 * internal findings row), not an external side effect, so it executes inline and
 * never pauses for the write-approval gate (which is for changes OUTSIDE legalOS).
 *
 * Reusing `tool_action` (rather than a new step-type union member) keeps the
 * engine, the step-type consumers, and the builder untouched — the deliberate
 * minimal-blast-radius choice for a dark stage (see D-221).
 */

/** Reserved serverId marking a native (non-MCP) action on a `tool_action` step. */
export const NATIVE_ACTIONS_SERVER_ID = "native:legalos";

/** The renewal watcher's effect: scan for upcoming renewals + record findings. */
export const RENEWAL_SCAN_ACTION = "record_renewal_findings";

/** The closed set of known native action names (a typo fails validation). */
export const NATIVE_ACTION_NAMES = new Set<string>([RENEWAL_SCAN_ACTION]);

/** True when a tool_action step targets a known native action (not an MCP tool). */
export function isNativeAction(serverId: string, toolName: string): boolean {
  return serverId === NATIVE_ACTIONS_SERVER_ID && NATIVE_ACTION_NAMES.has(toolName);
}
