"use client";

import { useEffect } from "react";

import { isReturnVisit, markArrivalRendered } from "@/lib/landing/arrival";

/**
 * Thin client boundary around the landing stage (D-128). Renders the
 * stage wrapper with a `data-arrival` attribute and nothing else; the
 * landing content stays server-rendered via `children` composition.
 *
 *   cold   — first render in this document: the full entrance
 *            choreography plays, and the marketing page-enter fade
 *            stands down via CSS so cold load looks exactly as it did
 *            before the transition layer existed.
 *   return — an in-app navigation back to the landing: CSS collapses
 *            the choreography to its settled end-state behind a single
 *            quick fade, and the glyph starts in its settled phase.
 *
 * Hydration safety: SSR always renders "cold" (the module flag is only
 * set from client effects), and on a hard load the first client render
 * reads the same `false`, so server and client agree by construction.
 * A soft-nav remount renders entirely on the client, so showing
 * "return" from its first frame has no hydration counterpart.
 */
export function LandingArrival({ children }: { children: React.ReactNode }) {
  const arrival = isReturnVisit() ? "return" : "cold";

  useEffect(() => {
    markArrivalRendered();
  }, []);

  return (
    <div
      data-arrival={arrival}
      className="landing-stage-in grid min-h-screen grid-rows-[auto_1fr_auto] bg-background"
    >
      {children}
    </div>
  );
}
