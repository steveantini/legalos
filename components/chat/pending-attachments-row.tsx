"use client";

import { AttachmentChip } from "./attachment-chip";

import type { PendingAttachment } from "@/lib/chat/pending-attachment";

type PendingAttachmentsRowProps = {
  attachments: PendingAttachment[];
  onRemove: (localId: string) => void;
};

/**
 * The row of pending-attachment chips above the composer textarea. Returns
 * null when empty so the composer carries no extra vertical space until
 * something is attached (an always-rendered empty row would push the textarea
 * down by a chip's height). Padding aligns the chips to the composer's px-3
 * content inset so they sit flush with the textarea text.
 */
export function PendingAttachmentsRow({
  attachments,
  onRemove,
}: PendingAttachmentsRowProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-3">
      {attachments.map((att) => (
        <AttachmentChip
          key={att.localId}
          attachment={att}
          onRemove={() => onRemove(att.localId)}
        />
      ))}
    </div>
  );
}
