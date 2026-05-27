"use server";

import { z } from "zod";

import {
  objectKeySegment,
  uploadAndExtractToBucket,
  type AttachmentMetadata,
} from "./_attachment-shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for per-message chat attachments (architecture §5a).
 *
 * Smaller than the agent-attachment surface (lib/actions/attachments.ts)
 * because there is no row-insert from the action and no "remove an existing
 * record" mode:
 *
 *   - The message_attachments row inserts in the chat route AFTER the message
 *     exists (the row's FK requires it), so this action only uploads + extracts
 *     and returns metadata for the client to hold in pending state until send.
 *   - Removal before send purges Storage only — there is no row yet.
 *
 * Storage layout (migration 0008): <user_id>/<conversation_id>/<message_id>/
 * <filename>. The client pre-allocates conversation_id and message_id (per
 * D-055) so the path is known at upload time, before the send round-trip. The
 * first path segment is auth.uid()::text, satisfying the storage policies.
 *
 * The 5-per-message cap and the aggregate text budget are NOT enforced here:
 * this action can't see the other files already uploaded under the same
 * message_id without an extra query, and both limits are enforced where the
 * full picture is visible — the client UI and the chat route on send.
 */

const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments";

/** Re-exported under a surface-specific name; identical shape to the shared one. */
export type MessageAttachmentMetadata = AttachmentMetadata;

export type MessageAttachmentErrorCode =
  | "unauthenticated"
  | "invalid_input"
  | "file_too_large"
  | "file_empty"
  | "file_missing"
  | "unsupported_type"
  | "attachment_limit_reached"
  | "internal_error";

export type MessageAttachmentUploadResult =
  | { ok: true; attachment: MessageAttachmentMetadata }
  | { ok: false; error: MessageAttachmentErrorCode };

export type MessageAttachmentRemoveResult =
  | { ok: true }
  | { ok: false; error: MessageAttachmentErrorCode };

const uploadSchema = z.object({
  conversation_id: z.string().uuid(),
  message_id: z.string().uuid(),
});

const removeSchema = z.object({
  storage_path: z.string().min(1).max(1024),
});

/**
 * Upload one file for an in-progress message turn and extract its text in the
 * same round-trip. Returns metadata (including the storage path) for the client
 * to hold in pending-attachment state; the row is inserted by the chat route at
 * send. No row insert here — see the module note.
 */
export async function uploadMessageAttachmentAction(
  formData: FormData,
): Promise<MessageAttachmentUploadResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const parsed = uploadSchema.safeParse({
    conversation_id: formData.get("conversation_id"),
    message_id: formData.get("message_id"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "file_missing" };

  const path = `${user.id}/${parsed.data.conversation_id}/${parsed.data.message_id}/${objectKeySegment(file.name)}`;
  const result = await uploadAndExtractToBucket({
    bucket: MESSAGE_ATTACHMENTS_BUCKET,
    path,
    file,
  });
  if (!result.ok) {
    // Shared file-level error codes (file_empty / file_too_large /
    // unsupported_type / internal_error) are a subset of this surface's codes.
    return { ok: false, error: result.error };
  }
  return { ok: true, attachment: result.attachment };
}

/**
 * Remove a not-yet-sent message attachment. Purges the Storage object only —
 * the row doesn't exist until send, so there is nothing else to clean up.
 * Unlike orphan cleanup, this is a user-initiated remove, so a failure is
 * surfaced rather than swallowed.
 */
export async function removeMessageAttachmentAction(
  formData: FormData,
): Promise<MessageAttachmentRemoveResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const parsed = removeSchema.safeParse({
    storage_path: formData.get("storage_path"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  // Defense in depth: the storage policies (0008) enforce
  // path[1] = auth.uid()::text, but the early reject is clearer.
  if (!parsed.data.storage_path.startsWith(`${user.id}/`)) {
    return { ok: false, error: "invalid_input" };
  }

  const { error: removeErr } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .remove([parsed.data.storage_path]);
  if (removeErr) {
    console.error("message attachment remove failed", {
      code: removeErr.message,
    });
    return { ok: false, error: "internal_error" };
  }
  return { ok: true };
}
