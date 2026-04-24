import { AgentCard } from "./agent-card";
import { categoryLabel } from "./category-labels";

import type { LaunchpadAgent } from "@/lib/auth/access";

interface CategorySectionProps {
  categorySlug: string;
  agents: LaunchpadAgent[];
  departmentSlug: string;
}

export function CategorySection({
  categorySlug,
  agents,
  departmentSlug,
}: CategorySectionProps) {
  if (agents.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {categoryLabel(categorySlug)}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            departmentSlug={departmentSlug}
          />
        ))}
      </div>
    </section>
  );
}
