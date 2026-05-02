import type { AccessibleDepartment } from "@/lib/auth/access";

import { DepartmentCard } from "./department-card";

/**
 * Section heading + 3-column card grid for the Aperture Workspace.
 *
 * The Aperture spec also calls for a "customize layout →" right action
 * on the section heading — hidden in this build since we don't have a
 * customize-layout feature yet (would be phantom UI). The label alone
 * stands as the section header.
 */
export function DepartmentGrid({
  departments,
  agentCounts,
}: {
  departments: AccessibleDepartment[];
  agentCounts: Record<string, number>;
}) {
  return (
    <section>
      <header className="flex items-baseline justify-between border-b border-hairline pb-[10px]">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Departments
        </h2>
        {/* "customize layout →" right action hidden — no feature to wire. */}
      </header>
      <div className="mt-[14px] grid grid-cols-3 gap-[14px]">
        {departments.map((d) => (
          <DepartmentCard
            key={d.id}
            department={d}
            agentCount={agentCounts[d.id] ?? 0}
          />
        ))}
      </div>
    </section>
  );
}
