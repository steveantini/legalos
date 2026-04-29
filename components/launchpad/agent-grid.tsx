import { AgentCard } from "./agent-card";

import type { LaunchpadAgent } from "@/lib/auth/access";

interface AgentGridProps {
  agents: LaunchpadAgent[];
  departmentSlug: string;
  isTemplate?: boolean;
}

/**
 * Renders a grid of AgentCards. Two callers in 8f-A: the Templates section
 * (passes isTemplate=true so native cards link to the fork form) and the My
 * Agents section (no isTemplate so native cards link to the chat surface).
 *
 * Categories within a department are deferred per architecture §2 — this
 * grid intentionally renders flat and lets the section header carry the
 * "Templates" / "My Agents" framing.
 */
export function AgentGrid({
  agents,
  departmentSlug,
  isTemplate,
}: AgentGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          departmentSlug={departmentSlug}
          isTemplate={isTemplate}
        />
      ))}
    </div>
  );
}
