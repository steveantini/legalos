import type { ReactNode } from "react";

import {
  AppWindow,
  Mono,
  type PlatformActive,
} from "@/components/landing/platform/platform-chrome";

/**
 * Per-section product visuals for /features (D-219). Each section's visual is a
 * discrete block placed BELOW the section prose at the page's 736px reading
 * measure, so the elegant reading column is preserved. Modular by design: a
 * later switch to the landing's wide alternating beside-the-prose tour is a
 * layout change (reposition these blocks into a grid at a wider measure), not a
 * rebuild. The windows reuse the landing's AppWindow + surfaces verbatim, so the
 * two pages read as one family.
 *
 * Static marketing pictures: no hover, no navigation, only the active rail item
 * highlighted (inherited from the landing components). On screens narrower than
 * the window's legible width the wrapper scrolls horizontally rather than
 * crushing the fixed-width rail.
 */
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
    <div className="overflow-x-auto pt-2">
      <div className="min-w-[680px]">
        <AppWindow active={active} crumbs={crumbs} rail={rail} compact>
          {children}
        </AppWindow>
      </div>
    </div>
  );
}

/** One panel of the redline diagram: a mono-caps label, two faint body lines,
 *  and a short document snippet. */
function RedlinePanel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 rounded-xl border border-hairline bg-paper-2 p-3.5">
      <Mono className="text-[9px] tracking-[0.14em] text-caption">{label}</Mono>
      <div className="mt-3 flex flex-col gap-2">
        <span className="block h-1.5 w-full rounded bg-hairline-strong" />
        <span className="block h-1.5 w-3/4 rounded bg-hairline-strong" />
        <p className="mt-1 font-sans text-[12.5px] leading-snug text-ink-2">
          {children}
        </p>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <span
      aria-hidden
      className="grid shrink-0 rotate-90 place-items-center self-center text-caption min-[600px]:rotate-0"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

/**
 * The deterministic redline diagram: original, revised, and the marked redline
 * with the change called out in place. Navy is the only accent (a deletion is
 * struck in muted ink, an insertion is navy); same warm-paper, mono-caps DNA as
 * the windows. Reads as "see exactly what changed, found by code not guessed."
 */
export function RedlineDiagram() {
  return (
    <figure className="pt-2">
      <div className="flex flex-col gap-3 min-[600px]:flex-row min-[600px]:items-stretch">
        <RedlinePanel label="ORIGINAL">…in effect until 2025…</RedlinePanel>
        <FlowArrow />
        <RedlinePanel label="REVISED">…in effect until 2026…</RedlinePanel>
        <FlowArrow />
        <RedlinePanel label="REDLINE">
          …in effect until{" "}
          <s className="text-caption decoration-caption">2025</s>{" "}
          <span className="font-medium text-primary">2026</span>…
        </RedlinePanel>
      </div>
      <figcaption className="mt-3 flex items-center gap-2">
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        <Mono className="text-[9.5px] tracking-[0.1em] text-caption">
          Found by code, not guessed; insertions and deletions marked in place
        </Mono>
      </figcaption>
    </figure>
  );
}
