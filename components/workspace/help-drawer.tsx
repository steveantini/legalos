"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowUpRightIcon, XIcon } from "lucide-react";

import { getDocPage } from "@/lib/marketing/documentation";
import { helpHref, helpTopicSlug, type HelpTopic } from "@/lib/workspace/help-links";

/**
 * The in-workspace help drawer (D-162): a right-side panel rendering the
 * mapped documentation guide IN PLACE, so help never navigates away from
 * the work. It renders the SAME data module the marketing site renders
 * (lib/marketing/documentation.tsx, via getDocPage) — one source, two
 * surfaces, zero drift; the new-tab journey is demoted to the explicit
 * "Open in documentation" escape in the header.
 *
 * Built on the house dialog primitive (Base UI), which carries the modal
 * mechanics: focus moves in on open and is trapped while open, Escape and
 * scrim-click dismiss, focus returns to the Help trigger on close, and
 * background scroll locks. ~1/3 viewport on desktop (clamped for a sane
 * prose measure), a full-width sheet under 720px per the house mobile
 * pattern. The slide uses the standard enter/exit utilities and falls
 * still under prefers-reduced-motion.
 *
 * The guide body keeps its marketing markup; a wrapper rescales the
 * editorial type to drawer proportions (headings and measure sized for a
 * ~440px column) so the content feels native to the workspace rather
 * than an embedded marketing page. Each open starts at the top.
 */
export function HelpDrawer({
  topic,
  open,
  onOpenChange,
}: {
  topic: HelpTopic;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const page = getDocPage(helpTopicSlug(topic));
  // Unreachable in practice: the topic union and the lockstep test pin
  // every slug to a published guide. Render nothing rather than throw.
  if (!page) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/15 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none" />
        <DialogPrimitive.Popup className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background outline-none duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none min-[720px]:w-[clamp(420px,36vw,560px)] min-[720px]:border-l min-[720px]:border-hairline min-[720px]:shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-caption">
                {page.audience}
              </p>
              <DialogPrimitive.Title className="mt-1 text-[17px] font-medium tracking-[-0.01em] text-foreground">
                {page.title}
              </DialogPrimitive.Title>
            </div>
            <div className="flex shrink-0 items-center gap-3 pt-0.5">
              <a
                href={helpHref(topic)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-caption transition-colors duration-release ease-release hover:text-foreground hover:duration-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
              >
                Open in documentation
                <ArrowUpRightIcon className="size-3" aria-hidden />
              </a>
              <DialogPrimitive.Close
                aria-label="Close help"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
              >
                <XIcon className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 pb-12">
            <p className="mt-5 text-[14px] leading-[1.65] text-ink-2">
              {page.lead}
            </p>
            {/* The marketing body, rescaled for the drawer's column. The
                descendant overrides outrank the body's own classes by
                specificity, so the shared module needs no drawer variant. */}
            <div className="[&_h2]:text-[16.5px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_section]:mt-7 [&_section]:pt-6 [&_section>div]:mt-3 [&_section>div]:text-[13.5px] [&_section>div]:leading-[1.7]">
              {page.body}
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
