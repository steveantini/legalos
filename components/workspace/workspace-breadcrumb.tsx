"use client";

import Link from "next/link";
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
  "knowledge-research": "Research",
  "knowledge-vault": "Vault",
  "knowledge-sources": "Sources",
  matters: "Matters / Deals",
  inbox: "Inbox",
  resources: "Resources",
  "workflows-templates": "Template Library",
  "integrations-marketplace": "Marketplace",
  "help-whats-new": "What’s New",
};

/**
 * The breadcrumb segment label for the workspace home page.
 *
 * Single source of truth: this string is used both as the rendered label in
 * ROUTE_TABLE entries AND as the lookup key in STATIC_SEGMENT_HREFS. Renaming
 * the segment (e.g., "Home" → "Dashboard") means changing only this constant;
 * the rendered literals and the href lookup stay in sync automatically.
 *
 * Stored Title-cased; the breadcrumb container's CSS lowercases it for display
 * (per the URL-bar mental model documented on the component below).
 */
const HOME_SEGMENT = "Home";

/**
 * Maps a breadcrumb segment string to its destination href when the
 * segment represents a real route. Segments not in this map render as
 * plain spans (scoping labels like "Departments" — no route exists).
 *
 * Agent and department names are dynamic and handled inline in the
 * renderer rather than statically here. The "Edit" entry is a
 * placeholder — Edit is always a leaf in practice, and its href
 * (`/workspace/agents/<id>/edit`) needs the agent id which isn't
 * available from the segment string alone.
 */
const STATIC_SEGMENT_HREFS: Record<string, string> = {
  [HOME_SEGMENT]: "/workspace",
  Departments: "/workspace/departments",
  Knowledge: "/workspace/knowledge",
  Workflows: "/workspace/workflows",
  Help: "/workspace/help",
  Settings: "/workspace/settings",
  Admin: "/workspace/admin",
  Trash: "/workspace/agents/trash",
  "User Access": "/workspace/admin/users",
  "Adoption Metrics": "/workspace/admin/metrics",
  "Productivity Calculator": "/workspace/admin/calculator",
  Edit: "",
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
 *     `/^\/agents\/([^/]+)/` regex (otherwise "new" / "Trash" would be
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
    match: "/workspace",
    segments: () => [HOME_SEGMENT],
  },
  {
    match: "/workspace/departments",
    segments: () => [HOME_SEGMENT, "Departments"],
  },
  {
    match: /^\/workspace\/departments\/([^/]+)/,
    segments: ({ captures, departments }) => {
      const slug = captures[0] ?? "";
      const dept = departments.find((d) => d.slug === slug);
      return [HOME_SEGMENT, "Departments", dept?.name ?? slug];
    },
  },
  {
    match: "/workspace/knowledge",
    segments: () => [HOME_SEGMENT, "Knowledge"],
  },
  {
    match: "/workspace/workflows",
    segments: () => [HOME_SEGMENT, "Workflows"],
  },
  {
    match: "/workspace/workflows/my-workflows",
    segments: () => [HOME_SEGMENT, "Workflows", "My Workflows"],
  },
  {
    match: "/workspace/help",
    segments: () => [HOME_SEGMENT, "Help"],
  },
  {
    match: "/workspace/help/guides",
    segments: () => [HOME_SEGMENT, "Help", "Guides"],
  },
  {
    match: "/workspace/agents/new",
    segments: ({ departments, searchParams }) => {
      const deptSlug = searchParams.get("department");
      const forkFrom = searchParams.get("fork_from");
      const lastSegment = forkFrom ? "Fork template" : "New agent";
      if (deptSlug) {
        const dept = departments.find((d) => d.slug === deptSlug);
        if (dept) {
          return [HOME_SEGMENT, "Departments", dept.name, lastSegment];
        }
      }
      // Defensive fallback — the page redirects to "/" on missing
      // department slug and notFound()s on unresolvable slug, so this
      // branch shouldn't render in practice.
      return [HOME_SEGMENT, "Departments", lastSegment];
    },
  },
  {
    match: "/workspace/agents/trash",
    segments: () => [HOME_SEGMENT, "Trash"],
  },
  {
    match: "/workspace/admin",
    segments: () => [HOME_SEGMENT, "Admin"],
  },
  {
    match: "/workspace/admin/users",
    segments: () => [HOME_SEGMENT, "Admin", "User Access"],
  },
  {
    match: "/workspace/admin/calculator",
    segments: () => [HOME_SEGMENT, "Admin", "Productivity Calculator"],
  },
  {
    match: "/workspace/admin/metrics",
    segments: () => [HOME_SEGMENT, "Admin", "Adoption Metrics"],
  },
  {
    match: "/workspace/settings",
    segments: () => [HOME_SEGMENT, "Settings"],
  },
  {
    match: "/workspace/settings/connections",
    segments: () => [HOME_SEGMENT, "Settings", "Connections"],
  },
  {
    match: "/workspace/settings/profile",
    segments: () => [HOME_SEGMENT, "Settings", "Profile"],
  },
  {
    match: "/workspace/settings/display",
    segments: () => [HOME_SEGMENT, "Settings", "Display"],
  },
  {
    match: /^\/workspace\/agents\/([^/]+)\/edit/,
    segments: ({ captures, agents }) => {
      const agentId = captures[0] ?? "";
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        return [
          HOME_SEGMENT,
          "Departments",
          agent.department_name,
          agent.name,
          "Edit",
        ];
      }
      // Defensive fallback — RLS should prevent this branch (the
      // layout's notFound() gate runs first).
      return [HOME_SEGMENT, "Departments", "Agent", "Edit"];
    },
  },
  {
    match: /^\/workspace\/agents\/([^/]+)/,
    segments: ({ captures, agents }) => {
      const agentId = captures[0] ?? "";
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        return [HOME_SEGMENT, "Departments", agent.department_name, agent.name];
      }
      return [HOME_SEGMENT, "Departments", "Agent"];
    },
  },
  {
    match: /^\/workspace\/coming-soon\/([^/]+)/,
    segments: ({ captures }) => {
      const area = captures[0] ?? "";
      const label = RESOURCE_AREA_LABELS[area] ?? area;
      return [HOME_SEGMENT, label];
    },
  },
];

/**
 * Client breadcrumb island for the workspace top bar. Walks the
 * `ROUTE_TABLE` and returns the first matching entry's segments;
 * falls through to `[HOME_SEGMENT]` for unrecognized paths (bare
 * `/coming-soon`, etc.).
 *
 * The active (last) segment renders bold ink; preceding segments
 * render muted. Any non-last segment that resolves to a real route
 * renders as a `<Link>`; scoping segments with no route (currently
 * "Departments") render as plain spans. Pathname- and search-params-
 * driven only — no other state.
 *
 * Breadcrumb segments render visually lowercase via
 * `text-transform: lowercase` on the outer container. Segment data
 * preserves the natural case of each item (department names like
 * "Commercial", admin tool names like "User Access") so the underlying
 * data model stays honest; the lowercase is a presentation choice
 * only. The display follows the URL-bar mental model (breadcrumbs as
 * the human-readable version of the current path) and intentionally
 * diverges from the rail's Title Case so the breadcrumb recedes into
 * chrome rather than competing with the page h1 for typographic
 * attention.
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
    <div className="text-[13px] text-caption lowercase">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        if (isLast) {
          return (
            <span key={i}>
              <strong className="font-medium text-foreground">{seg}</strong>
            </span>
          );
        }
        const href = resolveSegmentHref(seg, departments, agents);
        return (
          <span key={i}>
            {href !== null ? (
              <Link
                href={href}
                className="hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {seg}
              </Link>
            ) : (
              <span>{seg}</span>
            )}
            {" / "}
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
  return [HOME_SEGMENT];
}

/**
 * Resolve a single breadcrumb segment string to its destination href,
 * or null when the segment isn't routed. Static segments (Home,
 * Admin, Trash, the three admin tools) come from `STATIC_SEGMENT_HREFS`;
 * dynamic segments (department names, agent names) are resolved by
 * looking the string up in the layout's pre-fetched lists.
 *
 * Department-name lookups by display name are safe — `departments.name`
 * is unique within an org. Agent-name lookups can collide if two agents
 * share a name; the lookup returns the first match. Accepted at this
 * cohort scale; tighten to id-keyed resolution if collisions surface.
 *
 * The "Edit" entry in `STATIC_SEGMENT_HREFS` is intentionally empty —
 * Edit is always a leaf in the routes that produce it, and a true
 * Edit href would need the agent id which isn't available from a
 * single segment string in isolation.
 */
function resolveSegmentHref(
  seg: string,
  departments: AccessibleDepartment[],
  agents: AgentBreadcrumbContext[],
): string | null {
  if (seg in STATIC_SEGMENT_HREFS) {
    const href = STATIC_SEGMENT_HREFS[seg];
    return href === "" ? null : href;
  }

  const dept = departments.find((d) => d.name === seg);
  if (dept) {
    return `/workspace/departments/${dept.slug}`;
  }

  const agent = agents.find((a) => a.name === seg);
  if (agent) {
    return `/workspace/agents/${agent.id}`;
  }

  return null;
}
