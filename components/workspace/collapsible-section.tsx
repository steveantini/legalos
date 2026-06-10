"use client";

import { ChevronDownIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";

import {
  getUserPreferenceAction,
  setUserPreferenceAction,
} from "@/lib/actions/user-preferences";
import { type CollapsedSectionsValue } from "@/lib/preferences/keys";

interface CollapsibleSectionProps {
  /** Section heading text (e.g., "Approved agents"). */
  title: string;
  /**
   * Optional one-line subline trailing beside the heading (e.g., "Vetted
   * and tested by your department."). Renders muted at 12px on the title
   * row (a step below body text, so the mono-caps title keeps the lead);
   * on narrow viewports it wraps, whole, below the title rather
   * than truncating. Stays visible when the section is collapsed so the
   * orientation it provides survives the collapse, and sits outside the
   * toggle button so the button's accessible name stays the title.
   */
  description?: string;
  /** The CollapsedSectionsValue key this section's state stores under (per-vendor
   *  content sections use `external:<sourceId>`; the legacy keys are
   *  departmentAgents / externalAgents / myAgents; the Workflows screen uses
   *  `templates`). */
  sectionKey: string;
  /**
   * The full preference key the surface persists its collapsed-sections map
   * under (e.g. `deptCollapsedSectionsKey(slug)` on a launchpad,
   * `workflowsCollapsedSectionsKey` on the Workflows screen). The stored value
   * is a CollapsedSectionsValue keyed by `sectionKey`.
   */
  preferenceKey: string;
  /** Whether the section starts collapsed (from the server-fetched preference). */
  defaultCollapsed: boolean;
  /** Optional content to the right of the title — typically a count badge. */
  meta?: React.ReactNode;
  /** Whether to render at all. Empty sections may pass false to hide entirely. */
  visible?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible content section (the launchpad sectioning idiom, also used by
 * the Workflows screen). The whole header row is the toggle —
 * keyboard-accessible by default (Enter/Space toggle), rotating chevron
 * + `aria-expanded` for screen readers. Visual style matches the prior
 * non-collapsible section headers (mono-caps, hairline underline) so
 * the surface doesn't look refactored.
 *
 * State is optimistic: click flips local state immediately, the persist
 * call runs in a transition. The body's collapse animation uses the
 * `grid-rows-[1fr]` ↔ `grid-rows-[0fr]` pattern (Tailwind-native way to
 * animate `height: auto` without measuring content).
 *
 * Persistence is one preference row per surface (the caller's
 * `preferenceKey`), whose value merges every section's flag. Read-modify-write
 * on every toggle so the other sections' flags survive (single-tab
 * single-user, so the race window is effectively zero — the merge keeps it
 * correct anyway).
 */
export function CollapsibleSection({
  title,
  description,
  sectionKey,
  preferenceKey,
  defaultCollapsed,
  meta,
  visible = true,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [, startTransition] = useTransition();
  const contentId = useId();

  if (!visible) return null;

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    startTransition(async () => {
      await persistCollapsedState(preferenceKey, sectionKey, next);
    });
  };

  return (
    <section className="flex flex-col">
      {/* Header row: toggle button (chevron + title) with the subline
          trailing beside it and the count pinned right. The button + subline
          pair lives in a wrapping sub-row, so on a viewport too narrow for
          both, flex-wrap drops the subline, whole, below the title (no
          truncation) while the count stays on the title line.

          Baseline: the button aligns its own children on the baseline (the
          chevron opts out via self-center), so the button's baseline IS the
          title's text baseline — with items-center it would be derived from
          the chevron SVG's bottom edge and the subline would sit visibly low.

          Separator: the subline carries a "·" (the product's
          "Tuesday · June 9" idiom) as an absolutely-positioned ::before
          centered in the sub-row's column-gap. The gap is column-gap, NOT a
          margin on the subline, deliberately: column-gap exists only between
          items on the same line, so when the subline wraps below the title it
          sits flush left and the dot lands outside the row's content box,
          where overflow-x-clip hides it (a line-leading dot would read as
          broken). The row's px/-mx pair moves the clip edge 6px out so the
          button's focus ring survives the horizontal clip. */}
      <div className="-mx-1.5 flex items-baseline gap-2 overflow-x-clip border-b border-hairline px-1.5 pb-[10px]">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-[18px] gap-y-1">
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            className="group flex items-baseline gap-2 text-left transition-colors hover:[&_h2]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronDownIcon
              className={`h-3.5 w-3.5 shrink-0 self-center text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "-rotate-90" : "rotate-0"}`}
              strokeWidth={2}
              aria-hidden="true"
            />
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors duration-release ease-release motion-reduce:transition-none group-hover:duration-hover group-hover:ease-soft">
              {title}
            </h2>
          </button>
          {description ? (
            <p className="relative text-[12px] leading-[1.5] text-muted-foreground before:absolute before:-left-[18px] before:w-[18px] before:text-center before:content-['·']">
              {description}
            </p>
          ) : null}
        </div>
        {meta ? <span className="shrink-0">{meta}</span> : null}
      </div>

      <div
        id={contentId}
        className={`grid transition-all duration-200 motion-reduce:transition-none ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
      >
        <div className="overflow-hidden">
          <div className="pt-[14px]">{children}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * Read-modify-write the surface's preference row so each section only
 * mutates its own field. The merge happens on the read side so two
 * rapid toggles on different sections don't clobber each other (the
 * second read sees the first write).
 */
async function persistCollapsedState(
  prefKey: string,
  sectionKey: string,
  collapsed: boolean,
): Promise<void> {
  const current =
    await getUserPreferenceAction<CollapsedSectionsValue>(prefKey);
  const base: CollapsedSectionsValue =
    current.ok && current.value && typeof current.value === "object"
      ? current.value
      : {};
  const next: CollapsedSectionsValue = { ...base, [sectionKey]: collapsed };
  await setUserPreferenceAction(prefKey, next);
}
