"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";

import type {
  AccessibleDepartment,
  AgentBreadcrumbContext,
} from "@/lib/auth/access";

/**
 * Shared lookup of the rail's resource-link area slugs to display labels.
 * Mirrors the `RESOURCE_LINKS` array in `workspace-rail.tsx` — kept in
 * sync by hand for now since both lists are short and stable. If a third
 * consumer emerges, lift to a `lib/workspace/areas.ts` shared module.
 */
const RESOURCE_AREA_LABELS: Record<string, string> = {
  knowledge: "Knowledge",
  matters: "Matters / Deals",
  inbox: "Inbox",
  resources: "Resources",
};

/**
 * Context passed to a route entry's `segments` builder.
 */
type RouteContext = {
  /** Regex capture groups for regex matchers; empty array for string matchers. */
  captures: string[];
  departments: AccessibleDepartment[];
  agents: AgentBreadcrumbContext[];
  searchParams: ReadonlyURLSearchParams;
};

/**
 * Declarative route entry. Refactored from the previous procedural
 * `if`/`if`/`if` chain in 14 — easier to extend (one row per route)
 * and easier to audit (the matcher and builder live together).
 *
 * - `match: string`  → exact equality (`pathname === entry.match`).
 *                       `captures` is empty.
 * - `match: RegExp`  → `pathname.match(entry.match)`. `captures` =
 *                       `match.slice(1)`.
 *
 * Order matters between regex/literal collisions:
 *   - `/agents/new` and `/agents/trash` literals BEFORE the generic
 *     `/^\/agents\/([^/]+)/` regex (otherwise "new" / "trash" would be
 *     interpreted as agent ids).
 *   - `/^\/agents\/([^/]+)\/edit/` BEFORE `/^\/agents\/([^/]+)/`
 *     (otherwise the edit URL would match the chat regex first).
 *
 * The three `/admin*` literals are mutually exclusive among each other
 * (string equality), so order doesn't matter among them — they're
 * grouped together for readability.
 */
type RouteEntry = {
  match: string | RegExp;
  segments: (ctx: RouteContext) => string[];
};

const ROUTE_TABLE: ReadonlyArray<RouteEntry> = [
  {
    match: "/",
    segments: () => ["workspace", "departments"],
  },
  {
    match: /^\/departments\/([^/]+)/,
    segments: ({ captures, departments }) => {
      const slug = captures[0] ?? "";
      const dept = departments.find((d) => d.slug === slug);
      return ["workspace", "departments", dept?.name ?? slug];
    },
  },
  {
    match: "/agents/new",
    segments: ({ departments, searchParams }) => {
      const deptSlug = searchParams.get("department");
      const forkFrom = searchParams.get("fork_from");
      const lastSegment = forkFrom ? "Fork template" : "New agent";
      if (deptSlug) {
        const dept = departments.find((d) => d.slug === deptSlug);
        if (dept) {
          return ["workspace", "departments", dept.name, lastSegment];
        }
      }
      // Defensive fallback — the page redirects to "/" on missing
      // department slug and notFound()s on unresolvable slug, so this
      // branch shouldn't render in practice.
      return ["workspace", "departments", lastSegment];
    },
  },
  {
    match: "/agents/trash",
    segments: () => ["workspace", "trash"],
  },
  {
    match: "/admin",
    segments: () => ["workspace", "admin"],
  },
  {
    match: "/admin/calculator",
    segments: () => ["workspace", "admin", "Calculator"],
  },
  {
    match: "/admin/metrics",
    segments: () => ["workspace", "admin", "Metrics"],
  },
  {
    match: /^\/agents\/([^/]+)\/edit/,
    segments: ({ captures, agents }) => {
      const agentId = captures[0] ?? "";
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        return [
          "workspace",
          "departments",
          agent.department_name,
          agent.name,
          "Edit",
        ];
      }
      // Defensive fallback — RLS should prevent this branch (the
      // layout's notFound() gate runs first).
      return ["workspace", "departments", "Agent", "Edit"];
    },
  },
  {
    match: /^\/agents\/([^/]+)/,
    segments: ({ captures, agents }) => {
      const agentId = captures[0] ?? "";
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        return ["workspace", "departments", agent.department_name, agent.name];
      }
      return ["workspace", "departments", "Agent"];
    },
  },
  {
    match: /^\/coming-soon\/([^/]+)/,
    segments: ({ captures }) => {
      const area = captures[0] ?? "";
      const label = RESOURCE_AREA_LABELS[area] ?? area;
      return ["workspace", label];
    },
  },
];

/**
 * Client breadcrumb island for the workspace top bar. Walks the
 * `ROUTE_TABLE` and returns the first matching entry's segments;
 * falls through to `["workspace"]` for unrecognized paths (bare
 * `/coming-soon`, etc.).
 *
 * The active (last) segment renders bold ink; preceding segments
 * render muted. Pathname- and search-params-driven only — no other
 * state.
 *
 * `departments` and `agents` are passed from the workspace layout,
 * which fetches both for the rail. Lookups are O(n) per render and
 * fine for n ≤ a few hundred.
 */
export function WorkspaceBreadcrumb({
  departments,
  agents,
}: {
  departments: AccessibleDepartment[];
  agents: AgentBreadcrumbContext[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const segments = computeSegments(pathname, searchParams, departments, agents);

  return (
    <div className="text-[13px] text-caption">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i}>
            {isLast ? (
              <strong className="font-medium text-foreground">{seg}</strong>
            ) : (
              <span>{seg}</span>
            )}
            {!isLast ? " / " : null}
          </span>
        );
      })}
    </div>
  );
}

function computeSegments(
  pathname: string,
  searchParams: ReadonlyURLSearchParams,
  departments: AccessibleDepartment[],
  agents: AgentBreadcrumbContext[],
): string[] {
  for (const entry of ROUTE_TABLE) {
    if (typeof entry.match === "string") {
      if (pathname === entry.match) {
        return entry.segments({
          captures: [],
          departments,
          agents,
          searchParams,
        });
      }
    } else {
      const m = pathname.match(entry.match);
      if (m) {
        return entry.segments({
          captures: m.slice(1),
          departments,
          agents,
          searchParams,
        });
      }
    }
  }
  return ["workspace"];
}
