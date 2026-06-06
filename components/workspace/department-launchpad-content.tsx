"use client";

import { useState } from "react";

import { AgentDetailsPanel } from "@/components/workspace/agent-details-panel";
import { AgentGrid } from "@/components/workspace/agent-grid";
import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import {
  externalCollapseSectionKey,
  type ExternalAgentGroup,
} from "@/lib/agents/source";
import type { LaunchpadAgent } from "@/lib/auth/access";
import { VENDOR_CONTENT_PROVIDERS } from "@/lib/content/vendor-registry";
import {
  deptCollapsedSectionsKey,
  type CollapsedSectionsValue,
} from "@/lib/preferences/keys";

interface DepartmentLaunchpadContentProps {
  departmentAgents: LaunchpadAgent[];
  /** External (vendor) agents grouped by source — one section per vendor present
   *  (already filtered to org-permitted providers). */
  externalGroups: ExternalAgentGroup<LaunchpadAgent>[];
  /** Whether the org permits vendor content at all (Step 5). When false, NO
   *  vendor surface renders — not even the empty-state section. */
  vendorContentEnabled: boolean;
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
 * Client wrapper for the department launchpad's agent sections: Department
 * Agents (canonical), one section PER vendor content provider present
 * (registry-driven, dynamically titled — Claude for Legal today, Step 4), and
 * My Agents. Owns the read-only details-panel state: a single `detailsAgent`
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
  vendorContentEnabled,
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

  // Empty-state shape when a department has NO external agents from any vendor:
  // ONE empty section, not one-per-registered-provider. With the sole provider
  // today (Claude for Legal) this renders the exact same section the old single
  // bucket did (same title, key, and copy) — behavior-neutral. With multiple
  // providers it falls back to a generic "Curated content" title.
  const providers = Object.values(VENDOR_CONTENT_PROVIDERS);
  const soleProvider = providers.length === 1 ? providers[0] : null;
  const emptyExternalTitle = soleProvider?.displayLabel ?? "Curated content";
  const emptyExternalSectionKey = externalCollapseSectionKey(
    soleProvider?.providerId ?? "claude-for-legal",
  );
  const emptyExternalCopy =
    soleProvider?.providerId === "claude-for-legal"
      ? "Curated agents from Anthropic's open-source legal suite, coming to this department."
      : "Curated agent libraries will appear here as they're added.";

  return (
    <>
      {/* Department Agents — canonical departmental agents, click-to-chat
          directly. Hidden entirely when empty (no header for a bucket
          that doesn't exist). */}
      <CollapsibleSection
        title="Department Agents"
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
          cards. Governance (Step 5): when the org has turned vendor content OFF
          (`vendorContentEnabled` false), the whole vendor surface is hidden — no
          sections and no empty-state. When ON but a department has no vendor
          agents, a single empty-state section renders (not one per provider). */}
      {externalGroups.length > 0 ? (
        externalGroups.map((group) => {
          const key = externalCollapseSectionKey(group.sourceId);
          return (
            <CollapsibleSection
              key={group.sourceId}
              title={group.displayLabel}
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
      ) : vendorContentEnabled ? (
        <CollapsibleSection
          title={emptyExternalTitle}
          sectionKey={emptyExternalSectionKey}
          preferenceKey={collapsePrefKey}
          defaultCollapsed={initialCollapsedState[emptyExternalSectionKey] ?? false}
        >
          <div className="rounded-[14px] bg-muted p-8 text-center">
            <p className="text-[13px] leading-[1.5] text-muted-foreground">
              {emptyExternalCopy}
            </p>
          </div>
        </CollapsibleSection>
      ) : null}

      {/* My Agents — user-owned personal agents. Always rendered with an
          empty state when the user hasn't created anything yet. */}
      <CollapsibleSection
        title="My Agents"
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
