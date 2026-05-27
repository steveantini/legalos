"use client";

import { PaperclipIcon } from "lucide-react";

/**
 * Visual overlay shown while a file drag hovers the chat surface. Mounted
 * inside the ChatInterface root so it veils the entire visible message area,
 * not just the composer. It is decorative only: `pointer-events-none` lets the
 * drop event reach the parent's onDrop, and `aria-hidden` keeps screen readers
 * from announcing what is a pointer-only affordance during an active drag.
 *
 * The paperclip matches AttachButton so the picker and the drop target read as
 * one affordance with two triggers. The dashed border is the universal "drop
 * here" signal; the soft veil (bg-background/80 + blur) keeps the content
 * beneath visible so the user can see what they're dropping onto.
 */
type DropOverlayProps = {
  visible: boolean;
};

export function DropOverlay({ visible }: DropOverlayProps) {
  if (!visible) return null;
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-card px-8 py-6 text-center shadow-sm">
        <PaperclipIcon className="h-6 w-6 text-primary" aria-hidden />
        <div className="flex flex-col gap-1">
          <span className="text-base font-medium text-foreground">
            Drop to attach
          </span>
          <span className="text-sm text-caption">Up to 5 files, 20 MB each</span>
        </div>
      </div>
    </div>
  );
}
