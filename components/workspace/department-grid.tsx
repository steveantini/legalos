import type { DepartmentWithAccess } from "@/lib/auth/access";

import { DepartmentCard } from "./department-card";

/**
 * Purely presentational 3-column card grid of departments.
 *
 * Each card's locked vs. accessible variant is derived from
 * `department.hasAccess` (`DepartmentWithAccess` from
 * `getAllDepartmentsWithAccess`). The grid renders every department in
 * the org regardless of access; the card itself swaps to its locked
 * variant when access is false.
 *
 * The page-level header — the "Departments" h1 and the
 * "N agents across M departments" count caption — lives on the page that
 * renders this grid (`app/workspace/departments/page.tsx`). It was lifted
 * out of this component in the workspace-home restructure so the grid is
 * a reusable surface with no opinion about its surrounding chrome.
 */
export function DepartmentGrid({
  departments,
  agentCounts,
  canEdit = false,
}: {
  departments: DepartmentWithAccess[];
  agentCounts: Record<string, number>;
  canEdit?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-[14px]">
      {departments.map((d) => (
        <DepartmentCard
          key={d.id}
          department={d}
          agentCount={agentCounts[d.id] ?? 0}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
