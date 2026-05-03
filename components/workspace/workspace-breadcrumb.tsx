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
 * Client breadcrumb island for the workspace top bar. Reads the current
 * pathname and derives a breadcrumb of one of three shapes:
 *
 * - `/`                       → `workspace / departments`
 * - `/departments/<slug>`     → `workspace / departments / <Department.name>`
 * - `/coming-soon/<area>`     → `workspace / <Area Label>`
 * - anything else under (workspace) → `workspace` (single segment)
 *
 * The active (last) segment renders bold ink; preceding segments render
 * muted. The component is intentionally stateless — pathname-driven only.
 *
 * `departments` is passed from the workspace layout, which already
 * fetches it for the rail. Lookup is O(n) per render, which is fine for
 * n ≤ ~20.
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
              <strong className="font-medium text-foreground">
                {seg}
              </strong>
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
  if (pathname === "/") {
    return ["workspace", "departments"];
  }

  const deptMatch = pathname.match(/^\/departments\/([^/]+)/);
  if (deptMatch) {
    const slug = deptMatch[1];
    const dept = departments.find((d) => d.slug === slug);
    return ["workspace", "departments", dept?.name ?? slug];
  }

  // Literal /agents/new and /agents/trash must match BEFORE the generic
  // /agents/<id> regex below — otherwise "new" / "trash" would be
  // interpreted as agent ids and fall through to the defensive "Agent"
  // placeholder.
  if (pathname === "/agents/new") {
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
    // branch shouldn't render in practice. Keep the breadcrumb readable
    // rather than crashing.
    return ["workspace", "departments", lastSegment];
  }

  if (pathname === "/agents/trash") {
    return ["workspace", "trash"];
  }

  // /agents/<id>/edit must match BEFORE /agents/<id> because the edit
  // pathname also satisfies the simpler agent regex.
  const agentEditMatch = pathname.match(/^\/agents\/([^/]+)\/edit/);
  if (agentEditMatch) {
    const agentId = agentEditMatch[1];
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
    // Defensive fallback — RLS should prevent this branch (the layout's
    // notFound() gate runs first). Keep the breadcrumb readable rather
    // than crashing on a missing lookup.
    return ["workspace", "departments", "Agent", "Edit"];
  }

  const agentMatch = pathname.match(/^\/agents\/([^/]+)/);
  if (agentMatch) {
    const agentId = agentMatch[1];
    const agent = agents.find((a) => a.id === agentId);
    if (agent) {
      return ["workspace", "departments", agent.department_name, agent.name];
    }
    return ["workspace", "departments", "Agent"];
  }

  const comingSoonMatch = pathname.match(/^\/coming-soon\/([^/]+)/);
  if (comingSoonMatch) {
    const area = comingSoonMatch[1];
    const label = RESOURCE_AREA_LABELS[area] ?? area;
    return ["workspace", label];
  }

  // Bare /coming-soon or any unrecognized workspace path.
  return ["workspace"];
}
