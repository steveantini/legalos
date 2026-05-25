import type { Metadata } from "next";

import { DepartmentGrid } from "@/components/workspace/department-grid";
import {
  getAgentCountsByDepartment,
  getAllDepartmentsWithAccess,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "Departments",
};

/**
 * Department directory. Holds the department grid that used to live on
 * the workspace landing (moved here in the workspace-home restructure so
 * /workspace can be a personalized home). Page-level header matches the
 * Stage 1 group landings (44px h1 + description); the right-aligned count
 * caption carries forward the exact treatment the grid's old internal
 * caption used, for visual continuity.
 */
export default async function DepartmentsPage() {
  const authUser = await requireAuthUser();
  const [departments, agentCounts, canEdit] = await Promise.all([
    getAllDepartmentsWithAccess(authUser.id),
    getAgentCountsByDepartment(),
    isCurrentUserOrgAdmin(),
  ]);

  const totalAgents = Object.values(agentCounts).reduce((sum, n) => sum + n, 0);
  const deptCount = departments.length;
  const agentWord = totalAgents === 1 ? "agent" : "agents";
  const deptWord = deptCount === 1 ? "department" : "departments";

  return (
    <main className="flex flex-col gap-9">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h1 className="max-w-[28ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            Departments
          </h1>
          <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Practice areas your team works across. Each holds canonical agents,
            your team’s Claude for Legal imports, and personal agents.
          </p>
        </div>
        <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] tabular-nums text-caption">
          {totalAgents} {agentWord} across {deptCount} {deptWord}
        </p>
      </header>
      <DepartmentGrid
        departments={departments}
        agentCounts={agentCounts}
        canEdit={canEdit}
      />
    </main>
  );
}
