import type { ReactNode } from "react";

/**
 * Hero block of the Aperture Workspace landing.
 *
 * Renders the small mono "WORKSPACE" label, the h1 greeting, and a body
 * subline. The Aperture spec also calls for three right-aligned stats
 * (Open / SLA at risk / Saved · MTD) — hidden in this build per the
 * phantom-data scope rules (Session 9e); we don't have those metrics
 * yet, so the right side of the greet row is empty.
 *
 * The greeting accepts `**double-asterisk**` markdown for an inline
 * emphasis phrase that renders weight-500 + slate-blue, mirroring the
 * design's `<b>` styling. Today the page passes a plain greeting with
 * no asterisks, so the parser is a no-op; future content (e.g.,
 * "You have **two redlines** waiting") can opt in by passing markers
 * without a component change.
 */

const EMPHASIS_REGEX = /(\*\*.*?\*\*)/g;

function renderGreeting(text: string): ReactNode {
  const parts = text.split(EMPHASIS_REGEX);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <b key={i} className="font-medium text-primary">
          {part.slice(2, -2)}
        </b>
      );
    }
    return part;
  });
}

export function WorkspaceHero({
  greeting,
  subline,
}: {
  greeting: string;
  /**
   * Body copy under the greeting. Accepts a plain string for the standard
   * dynamic-counts case OR a ReactNode for richer compositions (e.g. the
   * empty-departments branch's mailto-CTA two-line treatment in
   * `app/(workspace)/page.tsx`). The wrapping `<p>` retains the muted-
   * foreground styling either way; inline anchors inherit the color and
   * can lift on hover.
   */
  subline: ReactNode;
}) {
  return (
    <section className="flex items-end justify-between gap-6">
      <div>
        <p className="mb-[14px] font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
          Workspace
        </p>
        <h1 className="max-w-[22ch] text-[52px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          {renderGreeting(greeting)}
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          {subline}
        </p>
      </div>
      {/* Stats column hidden per phantom-data scope rules. */}
    </section>
  );
}
