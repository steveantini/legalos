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
    }
  | {
      // A connected-Drive file picked into the composer (M6b plumbing; the
      // picker that constructs these ships in M6c). Immediately "ready" — there
      // is no client upload or extraction step, because the Drive content is
      // fetched live server-side at run-time, not uploaded. The display fields
      // (name + Drive mimeType) are captured at pick time so the chip renders
      // instantly without a Drive round-trip.
      localId: string;
      status: "ready";
      source: "gdrive_link";
      filename: string;
      sizeBytes: number; // 0 — Drive content is not measured at pick time
      contentType: string; // the Drive mimeType (may be a native Google type)
      fileId: string;
    };

export type ReadyAttachment = Extract<PendingAttachment, { status: "ready" }>;

export function isReady(p: PendingAttachment): p is ReadyAttachment {
  return p.status === "ready";
}

/** Whether a ready attachment is a Drive-backed file (vs a local upload). */
export function isDriveAttachment(
  p: ReadyAttachment,
): p is Extract<ReadyAttachment, { source: "gdrive_link" }> {
  return "source" in p && p.source === "gdrive_link";
}

export function totalSize(items: PendingAttachment[]): number {
  return items.reduce((sum, p) => sum + p.sizeBytes, 0);
}

export function countReady(items: PendingAttachment[]): number {
  return items.filter(isReady).length;
}

/** An uploaded local file riding the send payload (re-extracted server-side). */
export type UploadSendItem = {
  storage_path: string;
  original_filename: string;
  content_type: AllowedMimeType;
  size_bytes: number;
};

/** A Drive-backed file riding the send payload (resolved live server-side). */
export type DriveSendItem = {
  source_type: "gdrive_link";
  file_id: string;
  name: string;
  mime_type: string;
};

/**
 * The subset of pending attachments that ride a send payload (ready only).
 * Shaped to the chat route's `attachments` schema (a union of upload and Drive
 * items). For uploads, extracted_text is intentionally absent — the route
 * re-extracts from Storage for trust. For Drive items, only the file id and
 * display metadata travel; the content is fetched live at run-time, never
 * uploaded.
 */
export function toSendPayload(
  items: PendingAttachment[],
): Array<UploadSendItem | DriveSendItem> {
  return items.filter(isReady).map((p) => {
    if (isDriveAttachment(p)) {
      return {
        source_type: "gdrive_link",
        file_id: p.fileId,
        name: p.filename,
        mime_type: p.contentType,
      };
    }
    return {
      storage_path: p.storagePath,
      original_filename: p.filename,
      content_type: p.contentType,
      size_bytes: p.sizeBytes,
    };
  });
}
