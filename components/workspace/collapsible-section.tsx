"use client";

import { ChevronDownIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";

import {
  getUserPreferenceAction,
  setUserPreferenceAction,
} from "@/lib/actions/user-preferences";
import {
  type CollapsedSectionsValue,
  deptCollapsedSectionsKey,
} from "@/lib/preferences/keys";

interface CollapsibleSectionProps {
  /** Section heading text (e.g., "Department Agents"). */
  title: string;
  /** Field within the CollapsedSectionsValue shape that stores this section's state. */
  sectionKey: keyof CollapsedSectionsValue;
  /** Department slug for the preference key. */
  departmentSlug: string;
  /** Whether the section starts collapsed (from the server-fetched preference). */
  defaultCollapsed: boolean;
  /** Optional content to the right of the title — typically a count badge. */
  meta?: React.ReactNode;
  /** Whether to render at all. Empty sections may pass false to hide entirely. */
  visible?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible launchpad section. The whole header row is the toggle —
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
 * Persistence is one preference row per department: key is
 * `ui:dept:<slug>:collapsed_sections`, value merges the three section
 * flags. Read-modify-write on every toggle so the other sections'
 * flags survive (single-tab single-user, so the race window is
 * effectively zero — the merge keeps it correct anyway).
 */
export function CollapsibleSection({
  title,
  sectionKey,
  departmentSlug,
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
      await persistCollapsedState(departmentSlug, sectionKey, next);
    });
  };

  return (
    <section className="flex flex-col">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className="group flex w-full items-center gap-2 border-b border-hairline pb-[10px] text-left transition-colors hover:[&_h2]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "-rotate-90" : "rotate-0"}`}
          strokeWidth={2}
          aria-hidden="true"
        />
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors duration-release ease-release motion-reduce:transition-none group-hover:duration-hover group-hover:ease-soft">
          {title}
        </h2>
        {meta ? <span className="ml-auto">{meta}</span> : null}
      </button>

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
 * Read-modify-write the per-department preference row so each section
 * only mutates its own field. The merge happens on the read side so two
 * rapid toggles on different sections don't clobber each other (the
 * second read sees the first write).
 */
async function persistCollapsedState(
  departmentSlug: string,
  sectionKey: keyof CollapsedSectionsValue,
  collapsed: boolean,
): Promise<void> {
  const prefKey = deptCollapsedSectionsKey(departmentSlug);
  const current =
    await getUserPreferenceAction<CollapsedSectionsValue>(prefKey);
  const base: CollapsedSectionsValue =
    current.ok && current.value && typeof current.value === "object"
      ? current.value
      : {};
  const next: CollapsedSectionsValue = { ...base, [sectionKey]: collapsed };
  await setUserPreferenceAction(prefKey, next);
}
