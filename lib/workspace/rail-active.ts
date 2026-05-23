/**
 * Pure helper for resolving whether a rail leaf is active given the
 * current pathname. Extracted from `WorkspaceNavLink` so both the link
 * itself AND the parent group (for force-expand-when-active logic in
 * `<CollapsibleRailGroup>`) share one resolution path. Avoids divergent
 * active-state logic across the two consumers.
 */

export type RailLeafMatch = "exact" | "prefix";

/**
 * Map of agent id → department slug. Used by `isLeafActive` to extend
 * active resolution into the agent chat surface: when the user is on
 * `/workspace/agents/<id>`, the rail can highlight the agent's parent
 * department row by looking up the agent's department here.
 *
 * Built once at the rail entry by transforming the
 * `AgentBreadcrumbContext[]` fetched from
 * `getAccessibleAgentsForBreadcrumb`. Map shape gives O(1) per-link
 * lookups in place of the prior O(n) `Array.find` — small win today,
 * meaningful once the rail grows past a handful of links.
 */
export type AgentsLookup = { readonly [agentId: string]: string };

/**
 * Returns true when this rail leaf is the current page. Two resolution
 * paths:
 *
 *   1. Direct match — `exact` checks `pathname === href`; `prefix` also
 *      matches descendant paths via `pathname.startsWith(href + "/")`.
 *
 *   2. Agent → department extension — when the pathname is
 *      `/workspace/agents/<id>` and `href` is the agent's parent
 *      department link, returns true. Lets the rail's parent-
 *      department highlight follow navigation into a chat surface,
 *      even though chat URLs aren't structurally nested under
 *      `/workspace/departments/`.
 */
export function isLeafActive(
  pathname: string,
  href: string,
  match: RailLeafMatch,
  agentsLookup?: AgentsLookup,
): boolean {
  if (match === "exact") {
    if (pathname === href) return true;
  } else {
    if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  }

  if (agentsLookup && href.startsWith("/workspace/departments/")) {
    const agentMatch = pathname.match(/^\/workspace\/agents\/([^/]+)/);
    if (agentMatch) {
      const departmentSlug = agentsLookup[agentMatch[1]];
      if (
        departmentSlug &&
        href === `/workspace/departments/${departmentSlug}`
      ) {
        return true;
      }
    }
  }

  return false;
}
