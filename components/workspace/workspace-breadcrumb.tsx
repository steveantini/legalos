"use client";

import { usePathname } from "next/navigation";

import type { AccessibleDepartment } from "@/lib/auth/access";

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
}: {
  departments: AccessibleDepartment[];
}) {
  const pathname = usePathname();

  const segments = computeSegments(pathname, departments);

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
  departments: AccessibleDepartment[],
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

  const comingSoonMatch = pathname.match(/^\/coming-soon\/([^/]+)/);
  if (comingSoonMatch) {
    const area = comingSoonMatch[1];
    const label = RESOURCE_AREA_LABELS[area] ?? area;
    return ["workspace", label];
  }

  // Bare /coming-soon or any unrecognized workspace path.
  return ["workspace"];
}
