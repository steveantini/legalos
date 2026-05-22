"use client";

import { useState } from "react";

import { AgentDetailsPanel } from "@/components/workspace/agent-details-panel";
import { AgentGrid } from "@/components/workspace/agent-grid";
import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import type { LaunchpadAgent } from "@/lib/auth/access";
import type { CollapsedSectionsValue } from "@/lib/preferences/keys";

interface DepartmentLaunchpadContentProps {
  departmentAgents: LaunchpadAgent[];
  externalAgents: LaunchpadAgent[];
  myAgents: LaunchpadAgent[];
  departmentSlug: string;
  canManageTemplates: boolean;
  /**
   * Per-department, per-user collapsed state for the three sections.
   * Server-prefetched by the page so the first paint reflects the
   * persisted state (no flash of expanded → collapsed on load).
   * Missing fields default to expanded (the value the user hasn't
   * actively chosen to collapse stays open).
   */
  initialCollapsedState: CollapsedSectionsValue;
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
 * Each section is collapsible. Click the header to toggle; state
 * persists per department per user via the `user_preferences` table
 * (see `<CollapsibleSection>`). Default is expanded.
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
  initialCollapsedState,
}: DepartmentLaunchpadContentProps) {
  const [detailsAgent, setDetailsAgent] = useState<LaunchpadAgent | null>(
    null,
  );

  const countMeta = (n: number) =>
    n > 0 ? (
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {n}
      </span>
    ) : null;

  return (
    <>
      {/* Department Agents — canonical departmental agents, click-to-chat
          directly. Hidden entirely when empty (no header for a bucket
          that doesn't exist). */}
      <CollapsibleSection
        title="Department Agents"
        sectionKey="departmentAgents"
        departmentSlug={departmentSlug}
        defaultCollapsed={initialCollapsedState.departmentAgents ?? false}
        visible={departmentAgents.length > 0}
        meta={countMeta(departmentAgents.length)}
      >
        <AgentGrid
          agents={departmentAgents}
          departmentSlug={departmentSlug}
          canManageTemplates={canManageTemplates}
          onOpenDetails={setDetailsAgent}
        />
      </CollapsibleSection>

      {/* Claude for Legal — externally-sourced agents. Always rendered;
          empty state advertises that curated content is coming.
          `canManageTemplates` is forwarded so admin viewers get the
          overflow-menu affordances on C4L cards. */}
      <CollapsibleSection
        title="Claude for Legal"
        sectionKey="externalAgents"
        departmentSlug={departmentSlug}
        defaultCollapsed={initialCollapsedState.externalAgents ?? false}
        meta={countMeta(externalAgents.length)}
      >
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
      </CollapsibleSection>

      {/* My Agents — user-owned personal agents. Always rendered with an
          empty state when the user hasn't created anything yet. */}
      <CollapsibleSection
        title="My Agents"
        sectionKey="myAgents"
        departmentSlug={departmentSlug}
        defaultCollapsed={initialCollapsedState.myAgents ?? false}
        meta={countMeta(myAgents.length)}
      >
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
      </CollapsibleSection>

      <AgentDetailsPanel
        agent={detailsAgent}
        onClose={() => setDetailsAgent(null)}
      />
    </>
  );
}
