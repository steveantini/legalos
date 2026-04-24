import { CategorySection } from "./category-section";

import type { LaunchpadAgent } from "@/lib/auth/access";

interface LaunchpadGridProps {
  agents: LaunchpadAgent[];
  departmentSlug: string;
}

/**
 * Groups agents by `category` (preserving the query's category → sort_order
 * ordering) and renders a `CategorySection` per group. Falls back to a
 * single `uncategorized` group for agents without a category so nothing is
 * silently dropped.
 */
export function LaunchpadGrid({ agents, departmentSlug }: LaunchpadGridProps) {
  if (agents.length === 0) {
    return (
      <p className="mt-10 text-sm text-muted-foreground">
        No agents configured for this department yet.
      </p>
    );
  }

  const groups = new Map<string, LaunchpadAgent[]>();
  for (const agent of agents) {
    const key = agent.category ?? "uncategorized";
    const list = groups.get(key) ?? [];
    list.push(agent);
    groups.set(key, list);
  }

  return (
    <>
      {Array.from(groups.entries()).map(([categorySlug, categoryAgents]) => (
        <CategorySection
          key={categorySlug}
          categorySlug={categorySlug}
          agents={categoryAgents}
          departmentSlug={departmentSlug}
        />
      ))}
    </>
  );
}
