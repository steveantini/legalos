/**
 * Friendly display labels for a tool call in the chat trace (Phase 2, 2P-7a).
 *
 * The loop persists each MCP tool call under its NAMESPACED name (e.g.
 * `gdrive__search_files`, minted by lib/connections/mcp/tool-mapping.ts).
 * That name is the one field present in BOTH render states — live, where the
 * `tool_trace_start` SSE event carries only `{ id, name, input, ... }`, and
 * hydrated, where the persisted record also carries `access`/`server`. So we
 * derive the human-friendly label purely from the name, and the same label
 * shows while a call streams and after a reload.
 *
 * Presentation only: nothing here is sent to a model or a server.
 */

import { C4L_CONNECTORS } from "@/lib/connections/providers/c4l-connector-catalog";

/** The namespace separator tool-mapping uses: `<prefix>__<tool>`. */
const NAMESPACE_SEP = "__";

/**
 * Display names for the known first-party server prefixes: the clean
 * `gdrive`/`gmail`/`gcal` prefixes in tool-mapping's KNOWN_SERVER_PREFIXES,
 * plus every Claude for Legal catalog connector (prefix → its display name,
 * so "courtlistener__search" renders as "CourtListener: search" with the
 * vendor's real capitalization). A prefix outside this map is a
 * self-hosted/derived one; we humanize the slug instead (see
 * humanizeServerPrefix).
 */
const KNOWN_SERVER_LABELS: Record<string, string> = {
  gdrive: "Google Drive",
  gmail: "Gmail",
  gcal: "Calendar",
  ...Object.fromEntries(
    C4L_CONNECTORS.map((connector) => [
      connector.toolPrefix,
      connector.displayName,
    ]),
  ),
};

/**
 * Hosted tools that carry no server prefix. web_search is Anthropic's server
 * tool and keeps its established "Web search" label, so its trace reads the
 * same as before MCP tools existed.
 */
const BARE_TOOL_LABELS: Record<string, string> = {
  web_search: "Web search",
};

/** "search_files" becomes "search files": underscores to spaces, collapsed. */
function humanizeAction(action: string): string {
  return action.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Humanize a derived server prefix for display. tool-mapping mints derived
 * prefixes as `<slug>_<6-char hash>`; the trailing hash is routing noise, so
 * we drop it and title-case the slug. A prefix with no hash suffix (or one
 * that reduces to nothing) title-cases as-is, so the result is never blank.
 */
function humanizeServerPrefix(prefix: string): string {
  const withoutHash = prefix.replace(/_[a-z0-9]{6}$/, "");
  const slug = withoutHash.length > 0 ? withoutHash : prefix;
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** A tool call's friendly label, split so the UI can use the parts it needs. */
export type ToolLabel = {
  /** The full label, e.g. "Google Drive: search files" or "Web search". */
  full: string;
  /** The server portion, e.g. "Google Drive". Null for a bare (non-MCP) tool. */
  server: string | null;
  /** The action portion, e.g. "search files". For a bare tool, the full label. */
  action: string;
};

/**
 * Derive a friendly label for a tool call from its (possibly namespaced) name.
 *
 *   gdrive__search_files  → { full: "Google Drive: search files", … }
 *   gmail__create_draft   → { full: "Gmail: create draft", … }
 *   web_search            → { full: "Web search", … }
 *   acme_a1b2c3__do_thing → { full: "Acme: do thing", … }   (derived prefix)
 *
 * `serverDisplayName`, when the caller has it at hand (e.g. a persisted
 * self-hosted call carrying its connection's display name), overrides the
 * derived server label. Unknown bare names humanize the whole name as the
 * action, so an unmapped tool still reads cleanly rather than raw.
 */
export function toolLabel(name: string, serverDisplayName?: string): ToolLabel {
  const bare = BARE_TOOL_LABELS[name];
  if (bare) return { full: bare, server: null, action: bare };

  // sep <= 0 means no real prefix (no separator, or a leading separator with
  // an empty prefix): humanize the whole remainder as the action.
  const sep = name.indexOf(NAMESPACE_SEP);
  if (sep <= 0) {
    const action = humanizeAction(name);
    return { full: action, server: null, action };
  }

  const prefix = name.slice(0, sep);
  const rest = name.slice(sep + NAMESPACE_SEP.length);
  const server =
    serverDisplayName ??
    KNOWN_SERVER_LABELS[prefix] ??
    humanizeServerPrefix(prefix);
  const action = humanizeAction(rest);
  return { full: `${server}: ${action}`, server, action };
}
