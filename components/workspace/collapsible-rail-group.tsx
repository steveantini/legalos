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
 * - Force-expand-on-active behavior — rail-only; the launchpad has no
 *   active-leaf concern. When any leaf inside this group is the
 *   current page AND the user hasn't yet toggled this group in the
 *   current session, the group renders expanded regardless of the
 *   persisted preference. As soon as the user clicks the chevron, their
 *   choice wins for the rest of the session and persists to the
 *   preference — the chevron is always interactive, hover always
 *   present, no runtime lock. Force-expand is a courtesy default for
 *   "you just navigated here, here's where you are," not a permanent
 *   override.
 *
 *   The previous "force-expand disables the button" model meant a user
 *   inside a department could never collapse the Departments group,
 *   which violates the principle that the user's preference must
 *   always win over the system's preference.
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
  const contentId = useId();
  const [, startTransition] = useTransition();

  // Tracks the user's most-recent toggle in this session. `null` means
  // "the user hasn't touched this group yet" — render falls through to
  // the force-expand-if-active courtesy or the persisted preference.
  // Once the user clicks, their choice wins for the rest of the
  // session (and persists to the preference for future sessions).
  //
  // This shape (session-scoped user-override) is necessary because the
  // rail lives inside a persistent App Router layout — the component
  // mounts once per browser session and does NOT re-mount on intra-
  // layout navigation. A purely useState-initializer-based model would
  // satisfy force-expand on fresh page loads but not on navigation
  // between workspace routes.
  const [userToggle, setUserToggle] = useState<boolean | null>(null);

  const forceExpanded = leaves.some(({ href, match }) =>
    isLeafActive(pathname, href, match, agentsLookup),
  );

  const collapsed =
    userToggle !== null
      ? userToggle
      : forceExpanded
        ? false
        : defaultCollapsed;

  const handleToggle = () => {
    const next = !collapsed;
    setUserToggle(next);
    startTransition(async () => {
      await persistCollapsedState(groupKey, next);
    });
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-left transition-colors duration-release ease-release motion-reduce:transition-none hover:duration-hover hover:ease-soft hover:[&_span]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <ChevronDownIcon
          className={cn(
            "h-3 w-3 shrink-0 text-caption transition-transform duration-200 motion-reduce:transition-none",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className={cn(captionLabel, "transition-colors duration-release ease-release motion-reduce:transition-none group-hover:duration-hover group-hover:ease-soft")}>
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
