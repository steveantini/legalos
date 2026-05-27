import type { MessageAttachmentErrorCode } from "@/lib/actions/message-attachments";
import type { AllowedMimeType } from "@/lib/extract/extract";

/** Per-message attachment cap, enforced client-side; the chat route caps independently. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/**
 * Client-side lifecycle of a file the user has added to the composer but not
 * yet sent. Owned by ChatInterface state; rendered as a chip by
 * AttachmentChip; the ready subset rides the send payload.
 *
 * Two deliberate behaviors:
 *
 * 1. Failed attachments persist as chips until manually removed — they do NOT
 *    auto-disappear after a toast. A user who attaches a 25MB PDF over the cap
 *    and misses the flash toast still has a durable chip with an error subtitle
 *    and an obvious remove affordance. Toasts reinforce; chips are the state.
 *
 * 2. The "attaching" chip cannot be removed mid-flight (its remove X is hidden
 *    until the action resolves). Cancelling an in-flight upload would require
 *    aborting the server action's fetch, which the action contract doesn't
 *    support; rather than fake a cancel that cancels nothing, the chip waits
 *    out the upload. Files are capped at 20MB, so the wait is bounded.
 */
export type PendingAttachment =
  | {
      // Local-only identity; never reaches the server. React key + the handle
      // for remove-before-send.
      localId: string;
      status: "attaching";
      filename: string;
      sizeBytes: number;
      contentType: string;
    }
  | {
      localId: string;
      status: "ready";
      filename: string;
      sizeBytes: number;
      contentType: AllowedMimeType;
      storagePath: string;
      extractionWarning: string | null; // e.g. scanned PDF with no text layer
    }
  | {
      localId: string;
      status: "failed";
      filename: string;
      sizeBytes: number;
      contentType: string;
      errorCode: MessageAttachmentErrorCode;
    };

export type ReadyAttachment = Extract<PendingAttachment, { status: "ready" }>;

export function isReady(p: PendingAttachment): p is ReadyAttachment {
  return p.status === "ready";
}

export function totalSize(items: PendingAttachment[]): number {
  return items.reduce((sum, p) => sum + p.sizeBytes, 0);
}

export function countReady(items: PendingAttachment[]): number {
  return items.filter(isReady).length;
}

/**
 * The subset of pending attachments that ride a send payload (ready only).
 * Shaped to the chat route's `attachments` schema. extracted_text is
 * intentionally absent — the route re-extracts from Storage for trust.
 */
export function toSendPayload(items: PendingAttachment[]): Array<{
  storage_path: string;
  original_filename: string;
  content_type: AllowedMimeType;
  size_bytes: number;
}> {
  return items.filter(isReady).map((p) => ({
    storage_path: p.storagePath,
    original_filename: p.filename,
    content_type: p.contentType,
    size_bytes: p.sizeBytes,
  }));
}
