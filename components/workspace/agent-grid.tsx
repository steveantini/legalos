import type { LaunchpadAgent } from "@/lib/auth/access";

import { AgentCard } from "./agent-card";

/**
 * Server component grid mapper. Mirrors the shape of `<DepartmentGrid>`
 * but renders `<AgentCard>` instead. Each card derives its template /
 * user-owned branch from `agent.is_template`; the grid forwards
 * `canManageTemplates` (admin gate for template overflow menus) and
 * `isMyAgent` (My Agents bucket signal) so cards know which affordances
 * to render. Categories within a department are deferred per the
 * architecture doc — this grid is intentionally flat. Section headings
 * live in the page.
 */
export function AgentGrid({
  agents,
  departmentSlug,
  canManageTemplates,
  isMyAgent,
  onOpenDetails,
}: {
  agents: LaunchpadAgent[];
  departmentSlug: string;
  canManageTemplates?: boolean;
  isMyAgent?: boolean;
  /**
   * Optional handler that opens the read-only details panel for the
   * given agent. Forwarded to `<AgentCard>` for every agent in the grid;
   * the card then decides whether to render the Info-icon affordance
   * based on its own render branch (Canonical + C4L only).
   */
  onOpenDetails?: (agent: LaunchpadAgent) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-[14px]">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          departmentSlug={departmentSlug}
          canManageTemplates={canManageTemplates}
          isMyAgent={isMyAgent}
          onOpenDetails={
            onOpenDetails ? () => onOpenDetails(agent) : undefined
          }
        />
      ))}
    </div>
  );
}
