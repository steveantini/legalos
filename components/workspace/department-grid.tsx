import type { AccessibleDepartment } from "@/lib/auth/access";

import { DepartmentCard } from "./department-card";

/**
 * Section heading + 3-column card grid for the Aperture Workspace.
 *
 * Section header carries a quiet right-aligned count caption ("N
 * agents across M departments") relocated from the WorkspaceHero
 * subline in Session 21 — the hero now hosts either the welcome copy
 * (first login) or the persistent tagline (return logins), and the
 * count metadata reads better next to the grid it describes than as
 * the hero's primary subline.
 *
 * The Aperture spec also calls for a "customize layout →" right action
 * on the section heading — still hidden in this build (no customize-
 * layout feature; would be phantom UI). The count caption sits in the
 * same right-side flex slot.
 *
 * `lockedSlugs` is a Phase 2 demo placeholder for future RBAC. Cards
 * whose slug appears in this array render in their locked variant
 * (non-clickable, muted, lock icon, request-access mailto). Goes away
 * when real per-user department-role gating arrives via
 * `user_department_roles` (D-035).
 */
export function DepartmentGrid({
  departments,
  agentCounts,
  lockedSlugs = [],
}: {
  departments: AccessibleDepartment[];
  agentCounts: Record<string, number>;
  lockedSlugs?: readonly string[];
}) {
  // Sum from agentCounts in-component rather than threading a new
  // totalAgents prop from the page — single caller, single read,
  // keeps the props API focused on what's truly external.
  const totalAgents = Object.values(agentCounts).reduce((s, n) => s + n, 0);
  const deptCount = departments.length;
  const agentWord = totalAgents === 1 ? "agent" : "agents";
  const deptWord = deptCount === 1 ? "department" : "departments";

  return (
    <section>
      <header className="flex items-baseline justify-between gap-4 border-b border-hairline pb-[10px]">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Departments
        </h2>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-caption tabular-nums">
          {totalAgents} {agentWord} across {deptCount} {deptWord}
        </p>
      </header>
      <div className="mt-[14px] grid grid-cols-3 gap-[14px]">
        {departments.map((d) => (
          <DepartmentCard
            key={d.id}
            department={d}
            agentCount={agentCounts[d.id] ?? 0}
            isLocked={lockedSlugs.includes(d.slug)}
          />
        ))}
      </div>
    </section>
  );
}
