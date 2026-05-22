"use client";

import { useState } from "react";

import { AgentDetailsPanel } from "@/components/workspace/agent-details-panel";
import { AgentGrid } from "@/components/workspace/agent-grid";
import type { LaunchpadAgent } from "@/lib/auth/access";

interface DepartmentLaunchpadContentProps {
  departmentAgents: LaunchpadAgent[];
  externalAgents: LaunchpadAgent[];
  myAgents: LaunchpadAgent[];
  departmentSlug: string;
  canManageTemplates: boolean;
}

/**
 * Client wrapper for the department launchpad's three agent sections.
 * Owns the read-only details-panel state: a single `detailsAgent` slot
 * tracks which card the user peeked at most recently. All three card
 * tiers (Canonical, Claude for Legal, Personal) open the panel —
 * `<AgentCard>` renders the Info icon whenever `onOpenDetails` is
 * provided to its branch. External agents are the only kind that
 * don't get the affordance (they link out, no settings to peek at).
 *
 * Extracted from the department page so the page itself can stay a
 * server component handling auth + data fetching. The grids it renders
 * (`<AgentGrid>`) are not client-marked but become part of the client
 * bundle through this import — acceptable cost since the grids are
 * thin mappers.
 */
export function DepartmentLaunchpadContent({
  departmentAgents,
  externalAgents,
  myAgents,
  departmentSlug,
  canManageTemplates,
}: DepartmentLaunchpadContentProps) {
  const [detailsAgent, setDetailsAgent] = useState<LaunchpadAgent | null>(
    null,
  );

  const sectionHeading =
    "font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground";

  return (
    <>
      {departmentAgents.length > 0 ? (
        <section className="flex flex-col gap-[14px]">
          <header className="flex items-baseline justify-between border-b border-hairline pb-[10px]">
            <h2 className={sectionHeading}>Department Agents</h2>
          </header>
          <AgentGrid
            agents={departmentAgents}
            departmentSlug={departmentSlug}
            canManageTemplates={canManageTemplates}
            onOpenDetails={setDetailsAgent}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-[14px]">
        <header className="border-b border-hairline pb-[10px]">
          <h2 className={sectionHeading}>Claude for Legal</h2>
        </header>
        {externalAgents.length > 0 ? (
          <AgentGrid
            agents={externalAgents}
            departmentSlug={departmentSlug}
            canManageTemplates={canManageTemplates}
            onOpenDetails={setDetailsAgent}
          />
        ) : (
          <div className="rounded-[14px] bg-muted p-8 text-center">
            <p className="text-[13px] leading-[1.5] text-muted-foreground">
              Curated agents from Anthropic&apos;s open-source legal suite,
              coming to this department.
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-[14px]">
        <header className="border-b border-hairline pb-[10px]">
          <h2 className={sectionHeading}>My Agents</h2>
        </header>
        {myAgents.length > 0 ? (
          <AgentGrid
            agents={myAgents}
            departmentSlug={departmentSlug}
            isMyAgent
            onOpenDetails={setDetailsAgent}
          />
        ) : (
          <div className="rounded-[14px] bg-muted p-8 text-center">
            <p className="text-[13px] leading-[1.5] text-muted-foreground">
              You haven&apos;t created any agents yet. Use the New Agent
              button above to start one.
            </p>
          </div>
        )}
      </section>

      <AgentDetailsPanel
        agent={detailsAgent}
        onClose={() => setDetailsAgent(null)}
      />
    </>
  );
}
