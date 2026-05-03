import type { LaunchpadAgent } from "@/lib/auth/access";

import { AgentCard } from "./agent-card";

/**
 * Server component grid mapper. Mirrors the shape of `<DepartmentGrid>`
 * but renders `<AgentCard>` instead, with `isTemplate` / `isMyAgent`
 * forwarded so the cards know which branch to render. Categories within
 * a department are deferred per the architecture doc — this grid is
 * intentionally flat. Section headings live in the page.
 */
export function AgentGrid({
  agents,
  departmentSlug,
  isTemplate,
  isMyAgent,
}: {
  agents: LaunchpadAgent[];
  departmentSlug: string;
  isTemplate?: boolean;
  isMyAgent?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-[14px]">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          departmentSlug={departmentSlug}
          isTemplate={isTemplate}
          isMyAgent={isMyAgent}
        />
      ))}
    </div>
  );
}
