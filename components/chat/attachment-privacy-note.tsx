"use client";

import { ShieldCheckIcon } from "lucide-react";

/**
 * One-line reassurance caption shown once per session the first time a user
 * attaches a file in the composer. It states where files live ("your
 * workspace"), what happens during the chat ("sent to Claude for this
 * conversation"), and what doesn't ("isn't used for training"). The phrasing
 * is plain reassurance, not a contract — the full treatment lives on the
 * privacy policy page.
 *
 * Visibility is owned by ChatInterface (session-scoped, dismissed on send or
 * when the pending-attachments row clears); this component is purely
 * presentational. `role="status"` announces it politely to assistive tech at
 * the moment it appears, which is exactly when the reassurance is relevant.
 *
 * The shield-check icon reads as "vetted / safe" without the stricter-than-we-
 * mean baggage that lock iconography has accumulated in the AI privacy context.
 * The curly apostrophe in "isn't" matches the workspace prose convention (and
 * keeps a raw apostrophe out of JSX, which react/no-unescaped-entities flags).
 */
type AttachmentPrivacyNoteProps = {
  visible: boolean;
};

export function AttachmentPrivacyNote({ visible }: AttachmentPrivacyNoteProps) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-1.5 px-3 pt-1.5 text-xs text-caption"
    >
      <ShieldCheckIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        Files stay in your workspace. Content is sent to Claude for this
        conversation and isn’t used for training.
      </span>
    </div>
  );
}
