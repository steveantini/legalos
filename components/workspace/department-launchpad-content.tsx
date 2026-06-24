"use client";

import { useState } from "react";

import { AgentDetailsPanel } from "@/components/workspace/agent-details-panel";
import { AgentGrid } from "@/components/workspace/agent-grid";
import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import {
  externalCollapseSectionKey,
  getSourceLaunchpadSubline,
  type ExternalAgentGroup,
} from "@/lib/agents/source";
import type { LaunchpadAgent } from "@/lib/auth/access";
import {
  deptCollapsedSectionsKey,
  type CollapsedSectionsValue,
} from "@/lib/preferences/keys";

interface DepartmentLaunchpadContentProps {
  departmentAgents: LaunchpadAgent[];
  /** External (vendor) agents grouped by source — one section per vendor present
   *  (already filtered to org-permitted providers). Empty when the department has
   *  no vendor agents (or the org disabled every provider), in which case the
   *  vendor section renders nothing. */
  externalGroups: ExternalAgentGroup<LaunchpadAgent>[];
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
 * Client wrapper for the department launchpad's agent sections: Approved
 * agents (canonical), one section PER vendor content provider present
 * (registry-driven, dynamically titled — Claude for Legal today, Step 4), and
 * My agents. Each section heading carries a one-line subline so a cold user
 * reads the trust model at a glance (department-approved / Anthropic's
 * library / your own). Owns the read-only details-panel state: a single `detailsAgent`
 * slot tracks which card the user peeked at most recently. The card tiers open
 * the panel — `<AgentCard>` renders the Info icon whenever `onOpenDetails` is
 * provided to its branch.
 *
 * Each section is collapsible. Click the header to toggle; state persists per
 * department per user via the `user_preferences` table (see
 * `<CollapsibleSection>`), keyed per section — each vendor section keeps its own
 * collapse state (the legacy Claude for Legal section retains the
 * `externalAgents` key so existing preferences survive). Default is expanded.
 *
 * Extracted from the department page so the page itself can stay a
 * server component handling auth + data fetching. The grids it renders
 * (`<AgentGrid>`) are not client-marked but become part of the client
 * bundle through this import — acceptable cost since the grids are
 * thin mappers.
 */
export function DepartmentLaunchpadContent({
  departmentAgents,
  externalGroups,
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

  // The per-department preference row all of this launchpad's sections
  // persist their collapsed state under.
  const collapsePrefKey = deptCollapsedSectionsKey(departmentSlug);

  return (
    <>
      {/* Approved agents — canonical departmental agents, click-to-chat
          directly. Hidden entirely when empty (no header for a bucket
          that doesn't exist). */}
      <CollapsibleSection
        title="Approved agents"
        description="Vetted and tested by your department."
        sectionKey="departmentAgents"
        preferenceKey={collapsePrefKey}
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

      {/* Vendor content — one section PER vendor present, titled dynamically
          from the source registry (Claude for Legal today; a future provider
          gets its own titled section automatically). `canManageTemplates` is
          forwarded so admin viewers get the overflow-menu affordances on the
          cards. A department with no vendor agents renders nothing here (no
          empty placeholder section): org-level provider enablement is applied
          upstream when `externalGroups` is built, so a disabled provider, or a
          department a provider simply doesn't cover, yields no group and no
          section. */}
      {externalGroups.length > 0 ? (
        externalGroups.map((group) => {
          const key = externalCollapseSectionKey(group.sourceId);
          return (
            <CollapsibleSection
              key={group.sourceId}
              title={group.displayLabel}
              description={getSourceLaunchpadSubline(group.sourceId)}
              sectionKey={key}
              preferenceKey={collapsePrefKey}
              defaultCollapsed={initialCollapsedState[key] ?? false}
              meta={countMeta(group.agents.length)}
            >
              <AgentGrid
                agents={group.agents}
                departmentSlug={departmentSlug}
                canManageTemplates={canManageTemplates}
                onOpenDetails={setDetailsAgent}
              />
            </CollapsibleSection>
          );
        })
      ) : null}

      {/* My agents — user-owned personal agents. Always rendered with an
          empty state when the user hasn't created anything yet. The
          subline already says these are agents the user created, so the
          empty copy goes straight to the action. */}
      <CollapsibleSection
        title="My agents"
        description="Agents you’ve created. Yours to shape and experiment with."
        sectionKey="myAgents"
        preferenceKey={collapsePrefKey}
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
              Use the New agent button above to create your first.
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
