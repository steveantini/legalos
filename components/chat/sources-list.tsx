"use client";

import { useState } from "react";

import type { ChatSource } from "@/lib/chat/sse-parser";

interface SourcesListProps {
  sources: ChatSource[];
}

/**
 * Sources-list fold thresholds per chat-aperture-spec.md §2.4 edge case
 * ("15–20 sources: show first 5, fold the remainder"). FOLD_THRESHOLD is
 * the count above which folding kicks in; FOLDED_COUNT is what stays
 * visible while folded. Constants live at the top so a designer
 * adjusting the threshold does not have to spelunk through the JSX.
 */
const FOLD_THRESHOLD = 15;
const FOLDED_COUNT = 5;

/**
 * Pinned 3-column grid: ~22px number lane, flexible title, ~160px
 * domain right-aligned. Mobile (sm-) collapses to a single column —
 * number above title in muted slate, domain below title also muted.
 *
 * Each row carries `id="source-<src_id>"` so the citation chips in the
 * prose can scroll-link via `<a href="#source-...">`. The flash-on-
 * citation-click highlight is driven by the `chat-source-flash`
 * keyframe applied via classList manipulation in citation-marker.tsx.
 *
 * Fold state is local React state, resets to folded on every render
 * (including conversation reload). Per spec §5.2 — fold is per-message
 * UX, not persisted.
 */
export function SourcesList({ sources }: SourcesListProps) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  const needsFold = sources.length > FOLD_THRESHOLD;
  const visible =
    needsFold && !expanded ? sources.slice(0, FOLDED_COUNT) : sources;
  const hiddenCount = sources.length - visible.length;

  return (
    <section
      aria-label="Sources"
      className="mt-6 border-t border-border pt-3"
    >
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-caption">
        Sources
      </h3>
      <ol className="space-y-2">
        {visible.map((s, i) => {
          const number = i + 1;
          return (
            <li
              key={s.id}
              id={`source-${s.id}`}
              className="flex flex-col gap-x-4 gap-y-0.5 rounded-[4px] px-1 py-0.5 sm:grid sm:grid-cols-[22px_minmax(0,1fr)_180px] sm:items-baseline sm:gap-y-0"
            >
              <span className="font-mono text-[12px] tabular-nums text-primary sm:text-right">
                {number}
              </span>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block min-w-0 truncate text-[14px] leading-[1.4] text-foreground no-underline hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s.title || s.url}
              </a>
              <span className="block truncate font-mono text-[12px] text-caption sm:text-right">
                {s.domain}
              </span>
            </li>
          );
        })}
      </ol>
      {needsFold && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 font-mono text-[12px] text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          show {hiddenCount} more →
        </button>
      ) : null}
    </section>
  );
}
