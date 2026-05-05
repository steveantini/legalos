"use client";

import type { MouseEvent } from "react";

interface CitationMarkerProps {
  index: number;
  sourceId: string;
  title: string;
}

const FLASH_CLASS = "chat-source-flash";

/**
 * Click → smooth-scroll to the matching source row, then flash its
 * background once. The target row owns its own id (`source-<src_id>`)
 * via SourcesList; missing target = no-op (prose still received its
 * <sup> chip but the sources list is gone, e.g. mid-edit). Flash class
 * removes itself onAnimationEnd via a one-shot listener so we don't
 * leave dangling state on the DOM.
 *
 * Smooth scroll respects `prefers-reduced-motion: reduce` automatically
 * via the browser's behavior:"smooth" implementation; the keyframe
 * itself is gated by the global media query in app/globals.css.
 */
function handleClick(
  event: MouseEvent<HTMLAnchorElement>,
  sourceId: string,
) {
  event.preventDefault();
  if (typeof document === "undefined") return;
  const target = document.getElementById(`source-${sourceId}`);
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center" });

  // Re-trigger the flash by removing then re-adding on the next frame.
  // Without the dance, two rapid clicks on the same chip would skip the
  // second flash because the class is already present.
  target.classList.remove(FLASH_CLASS);
  // Force reflow before re-applying so the animation restarts.
  void target.offsetWidth;
  target.classList.add(FLASH_CLASS);
  const onEnd = () => {
    target.classList.remove(FLASH_CLASS);
    target.removeEventListener("animationend", onEnd);
  };
  target.addEventListener("animationend", onEnd);
}

/**
 * Inline citation chip — replaces the browser-default <sup>{N}</sup>
 * baseline from Step B with the styled pill specified in
 * chat-aperture-spec.md §2.4.
 *
 *   - Geist Mono, 0.7em (≈ 10px against 14.5px prose), weight 500
 *   - chat-cite-bg fill, chat-cite-border at 1px
 *   - Hover: bg darkens to chat-cite-bg-hover (180ms ease)
 *   - Click: smooth-scroll to the source row + 600ms cite-flash highlight
 *
 * The chip is an <a href="#source-<id>"> so right-click "open in new tab"
 * lands you at the in-page anchor and screen readers announce a link
 * destination. The numeric label is the index (1-based) into the
 * message's sources array — passed as a prop, not computed here, since
 * the parent already does the lookup to derive the title for aria-label.
 */
export function CitationMarker({
  index,
  sourceId,
  title,
}: CitationMarkerProps) {
  return (
    <sup className="leading-none">
      <a
        href={`#source-${sourceId}`}
        data-source-id={sourceId}
        onClick={(e) => handleClick(e, sourceId)}
        aria-label={`Citation ${index}, source: ${title}`}
        className="mx-[1px] inline-block rounded-[4px] border border-chat-cite-border bg-chat-cite-bg px-[5px] py-[1px] align-super font-mono text-[0.7em] font-medium leading-none text-primary no-underline transition-colors duration-[180ms] ease-out hover:bg-chat-cite-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {index}
      </a>
    </sup>
  );
}
