import type { ReactNode } from "react";

import {
  AppWindow,
  type PlatformActive,
} from "@/components/landing/platform/platform-chrome";
import { cn } from "@/lib/utils";

/**
 * The /features product tour, in the landing's beside-the-prose alternating
 * rhythm (D-219, switched from the below-the-prose Option-2 layout). Each
 * FeatureRow pairs a section's heading + prose with a reused landing window
 * beside it, alternating sides down the page, so /features and the landing
 * below-hero read as one family.
 *
 * Responsive: the single breakpoint is 1180px (matching the landing). Above it,
 * two columns with the window alternating left/right. At or below it, a single
 * column with the heading + prose ABOVE the window. The rows break out of the
 * page's 736px reading column into a wider band (the widener in the page);
 * the heading, lead, and the prose-strong close stay in the reading column.
 *
 * Static marketing pictures: no hover, no navigation, only the active rail item
 * highlighted (inherited from the landing components). On screens too narrow for
 * the fixed rail the window scrolls horizontally rather than crushing.
 */

/** A reused landing window, sized to fill its row column. Scrolls horizontally
 *  only when the column is narrower than the rail needs (small screens). */
export function FeatureWindow({
  active,
  crumbs,
  rail = "workspace",
  children,
}: {
  active: PlatformActive;
  crumbs: string[];
  rail?: "workspace" | "admin";
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <AppWindow active={active} crumbs={crumbs} rail={rail} compact>
          {children}
        </AppWindow>
      </div>
    </div>
  );
}

/**
 * One tour row: an anchored section whose heading + prose sit beside a window,
 * alternating which side the window takes, with a per-row dominance.
 *
 * Two knobs make each row clearly asymmetric (D-219 tuning):
 *  - The column split. Window-dominant rows give the window a 1.55fr track and
 *    the prose a 1fr track. Prose-dominant rows flip it: the prose takes a 1fr
 *    track (the wide remainder) and the window sits in an `auto` track sized to
 *    its (scaled) width, so the prose clearly dominates.
 *  - The window scale. A prose-dominant window is laid out at a comfortable
 *    internal width and zoomed DOWN to a smaller visual footprint, so it reads
 *    as a supporting visual yet stays legible (the surfaces need ~600px of
 *    internal width for the fixed-width rail, so we scale the box, not the
 *    layout). Window-dominant windows render at full fill, no zoom.
 *
 * On the 1180px collapse both variants behave the same: a single column with
 * the heading + prose above the window (no zoom), matching the landing.
 */
export function FeatureRow({
  id,
  title,
  windowLeft = false,
  proseDominant = false,
  visual,
  children,
}: {
  id: string;
  title: string;
  windowLeft?: boolean;
  proseDominant?: boolean;
  visual: ReactNode;
  children: ReactNode;
}) {
  const columns = proseDominant
    ? windowLeft
      ? "min-[1181px]:grid-cols-[auto_minmax(0,1fr)]"
      : "min-[1181px]:grid-cols-[minmax(0,1fr)_auto]"
    : windowLeft
      ? "min-[1181px]:grid-cols-[1.55fr_minmax(0,1fr)]"
      : "min-[1181px]:grid-cols-[minmax(0,1fr)_1.55fr]";
  return (
    <section
      id={id}
      className={cn(
        "mt-10 grid scroll-mt-6 grid-cols-1 items-start gap-7 border-t border-hairline pt-9",
        "min-[1181px]:items-center min-[1181px]:gap-12",
        columns,
      )}
    >
      <div
        className={cn(
          "order-1 flex min-w-0 flex-col",
          windowLeft ? "min-[1181px]:order-2" : "min-[1181px]:order-1",
        )}
      >
        <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground min-[720px]:text-[32px]">
          {title}
        </h2>
        <div className="mt-5 space-y-4 text-[15px] leading-[1.75] text-ink-2">
          {children}
        </div>
      </div>
      <div
        className={cn(
          "order-2 min-w-0",
          windowLeft ? "min-[1181px]:order-1" : "min-[1181px]:order-2",
        )}
      >
        {proseDominant ? (
          <div className="min-[1181px]:w-[600px] min-[1181px]:[zoom:0.82]">
            {visual}
          </div>
        ) : (
          visual
        )}
      </div>
    </section>
  );
}
