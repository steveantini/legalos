"use client";

import { CircleHelpIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import type { HelpTopic } from "@/lib/workspace/help-links";

/**
 * The quiet per-surface help affordance (Documentation arc Step 2, now a
 * drawer trigger — D-162): a small "Help" button placed consistently in a
 * surface's header row. Clicking slides in the help drawer with that
 * surface's documentation guide rendered IN PLACE (help-drawer.tsx), so
 * reading help never leaves the work; the full documentation site remains
 * one explicit "Open in documentation" link away inside the drawer.
 * Consistency over prominence: caption color at rest, the standard
 * hover-deepen, never a floating widget.
 *
 * Topics are a typed union over the real guide slugs
 * (lib/workspace/help-links.ts), so an unmapped surface simply has no
 * affordance — a dead target is a compile error, not a 404. The drawer
 * (and the documentation module it renders) is code-split and loads on
 * the first click, so surfaces that never open help never pay for it.
 */

const HelpDrawer = dynamic(() =>
  import("@/components/workspace/help-drawer").then(
    (module) => module.HelpDrawer,
  ),
);

export function HelpLink({
  topic,
  className = "",
}: {
  topic: HelpTopic;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // The drawer mounts on first use and stays mounted after, so reopening
  // is instant and the close animation can play out.
  const [everOpened, setEverOpened] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEverOpened(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={`inline-flex shrink-0 items-center gap-1 rounded-md text-[12px] font-medium text-caption transition-colors duration-release ease-release hover:text-foreground hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${className}`}
      >
        <CircleHelpIcon className="size-3.5" aria-hidden />
        Help
      </button>
      {everOpened ? (
        <HelpDrawer topic={topic} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
