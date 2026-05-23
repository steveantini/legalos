"use client";

import { ChevronDownIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useId, useState, useTransition } from "react";

import {
  getUserPreferenceAction,
  setUserPreferenceAction,
} from "@/lib/actions/user-preferences";
import {
  railGroupsCollapsedKey,
  type RailGroupsCollapsedValue,
} from "@/lib/preferences/keys";
import { cn } from "@/lib/utils";
import {
  type AgentsLookup,
  isLeafActive,
  type RailLeafMatch,
} from "@/lib/workspace/rail-active";
import { captionLabel } from "@/lib/workspace/rail-styles";

/**
 * One leaf's worth of active-resolution input. The parent rail passes
 * an array of these so this component can compute `forceExpanded`
 * itself (via `usePathname()` + `isLeafActive`) — keeping pathname-
 * dependent logic in one client-side place and the rail server-side.
 */
type RailLeafActiveSpec = {
  href: string;
  match: RailLeafMatch;
};

interface CollapsibleRailGroupProps {
  /** Caption shown in the group header (e.g., "Departments", "Knowledge"). */
  caption: string;
  /** Field within `RailGroupsCollapsedValue` storing this group's flag. */
  groupKey: keyof RailGroupsCollapsedValue;
  /** Initial collapsed state from the server-fetched preference. */
  defaultCollapsed: boolean;
  /**
   * Leaves inside this group, with the href and match mode used for
   * active-state resolution. The component computes `forceExpanded`
   * itself by running `isLeafActive` against the current pathname for
   * every leaf — when any leaf is active, the group force-expands so
   * we never hide the user's current location.
   *
   * External leaves and locked rows (which can never be the current
   * page) are excluded by the caller.
   */
  leaves: ReadonlyArray<RailLeafActiveSpec>;
  /**
   * Agent id → department slug map, used by `isLeafActive` when the
   * user is on `/workspace/agents/<id>` and the rail needs to
   * highlight the agent's parent department row. Only the Departments
   * group needs this; resource groups omit it.
   */
  agentsLookup?: AgentsLookup;
  children: React.ReactNode;
}

/**
 * Collapsible group wrapper for the workspace rail. Sibling to
 * `<CollapsibleSection>` (commit e3b7904) on the launchpad — same
 * disclosure pattern, animation duration, optimistic-persist model,
 * and a11y primitives, with rail-appropriate divergences:
 *
 * - Typography stays at `captionLabel` (10px, default weight, tracking
 *   0.14em) — every rail caption uses one typography spec; we don't
 *   introduce a second scale for "collapsible vs static" captions.
 * - Smaller chevron (h-3 w-3, 12px) — proportional to the smaller
 *   caption.
 * - No `border-b border-hairline` underline; the rail's existing leaf-
 *   list rhythm provides visual separation, and an underline would
 *   compete with that rhythm.
 * - `forceExpanded` behavior — rail-only; the launchpad has no active-
 *   leaf concern. When any leaf inside this group is the current page,
 *   the group renders expanded regardless of the persisted preference,
 *   and the toggle button is disabled. The preference is NOT
 *   overwritten while force-expand wins — the user's choice is
 *   preserved for when they navigate elsewhere.
 *
 * Persistence: per-user via `ui:rail:groups_collapsed`. Read-modify-
 * write helper merges this group's flag into the existing preference
 * row so rapid toggles on different groups don't clobber each other —
 * same pattern as the launchpad's `persistCollapsedState`.
 *
 * Accessibility: native `<button>` (free Enter/Space toggle),
 * `aria-expanded`, `aria-controls` linking to the content region id
 * (via `useId()`), `aria-hidden` on the chevron, focus-visible outline.
 * `motion-reduce:transition-none` on both transitions honors
 * `prefers-reduced-motion`.
 */
export function CollapsibleRailGroup({
  caption,
  groupKey,
  defaultCollapsed,
  leaves,
  agentsLookup,
  children,
}: CollapsibleRailGroupProps) {
  const pathname = usePathname();
  const [collapsedState, setCollapsedState] = useState(defaultCollapsed);
  const [, startTransition] = useTransition();
  const contentId = useId();

  const forceExpanded = leaves.some(({ href, match }) =>
    isLeafActive(pathname, href, match, agentsLookup),
  );
  const collapsed = forceExpanded ? false : collapsedState;

  const handleToggle = () => {
    // No-op when force-expanded. Avoids the confusing UX where clicking
    // does nothing visible (force-expand wins) but does write a
    // preference the user can't see take effect.
    if (forceExpanded) return;
    const next = !collapsedState;
    setCollapsedState(next);
    startTransition(async () => {
      await persistCollapsedState(groupKey, next);
    });
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={handleToggle}
        disabled={forceExpanded}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          forceExpanded
            ? "cursor-default"
            : "hover:[&_span]:text-foreground",
        )}
      >
        <ChevronDownIcon
          className={cn(
            "h-3 w-3 shrink-0 text-caption transition-transform duration-200 motion-reduce:transition-none",
            collapsed ? "-rotate-90" : "rotate-0",
            forceExpanded && "opacity-40",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className={cn(captionLabel, "transition-colors")}>
          {caption}
        </span>
      </button>

      <div
        id={contentId}
        className={cn(
          "grid transition-all duration-200 motion-reduce:transition-none",
          collapsed
            ? "grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-px pt-[8px]">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Read-modify-write the rail groups preference row so each group only
 * mutates its own field. The merge happens on the read side so two
 * rapid toggles on different groups don't clobber each other — the
 * second read sees the first write. Mirrors the launchpad's
 * `persistCollapsedState` pattern.
 */
async function persistCollapsedState(
  groupKey: keyof RailGroupsCollapsedValue,
  collapsed: boolean,
): Promise<void> {
  const current = await getUserPreferenceAction<RailGroupsCollapsedValue>(
    railGroupsCollapsedKey,
  );
  const base: RailGroupsCollapsedValue =
    current.ok && current.value && typeof current.value === "object"
      ? current.value
      : {};
  const next: RailGroupsCollapsedValue = { ...base, [groupKey]: collapsed };
  await setUserPreferenceAction(railGroupsCollapsedKey, next);
}
