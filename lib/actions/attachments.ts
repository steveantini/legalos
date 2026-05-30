"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  objectKeySegment,
  uploadAndExtractToBucket,
  type AttachmentMetadata,
  type AttachmentUploadError,
} from "./_attachment-shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";


/**
 * Server actions for permanent agent attachments (architecture §3).
 *
 * Two flows the form must handle:
 *
 *   - Create mode: agent doesn't exist yet at upload time. The form pre-
 *     allocates the agent UUID client-side and uploads to that path. The
 *     "draft" actions move bytes around without touching the
 *     agent_attachments table — the rows insert atomically when
 *     createAgentAction runs at form save.
 *
 *   - Edit mode: agent exists. The "bound" actions upload AND insert (or
 *     soft-delete) in one round trip.
 *
 * Storage layout: <user_id>/<agent_id>/<filename>. The first path segment
 * is auth.uid()::text, satisfying the storage policies in 0008. The
 * filename inside the path is sanitized via slugify() because Supabase
 * Storage object keys cannot contain certain characters and the user-
 * provided filename is preserved separately in
 * agent_attachments.original_filename.
 *
 * 20MB / 5-attachment / MIME allowlist limits enforced both client-side
 * (UX) and server-side (defense in depth). The bucket itself enforces
 * file_size_limit and allowed_mime_types as the last line.
 */

const MAX_ATTACHMENTS_PER_AGENT = 5;
const STORAGE_BUCKET = "agent-attachments";

const idSchema = z.object({
  agent_id: z.string().uuid(),
});

const removeSchema = z.object({
  attachment_id: z.string().uuid(),
});

const removeDraftSchema = z.object({
  storage_path: z.string().min(1),
});

export type UploadResult =
  | { ok: true; attachment: AttachmentMetadata }
  | { ok: false; error: string };

export type AddResult =
  | { ok: true; attachmentId: string; metadata: AttachmentMetadata }
  | { ok: false; error: string };

export type RemoveResult = { ok: true } | { ok: false; error: string };

/**
 * Map a shared file-level upload error to the agent surface's user-facing
 * copy. Preserves the exact strings the agent attachment UI showed before the
 * upload + extraction logic moved into the shared helper.
 */
function uploadErrorToMessage(code: AttachmentUploadError): string {
  switch (code) {
    case "file_empty":
      return "File is empty.";
    case "file_too_large":
      return "File is larger than 20MB.";
    case "unsupported_type":
      return "Unsupported file type. Allowed: PDF, DOCX, TXT, MD, XLSX.";
    case "internal_error":
    default:
      return "Could not upload file. Try again.";
  }
}

/**
 * Common upload + extraction path used by both draft and bound modes. Builds
 * the agent storage path (<user_id>/<agent_id>/<key>) and delegates file
 * validation + upload + extraction to the shared helper.
 *
 * Per architecture §3 / Decision Q3 from the 8h plan: a failed extraction
 * surfaces as a warning the user removes manually, so the storage object is
 * kept and the result carries extractedText: null + extractionWarning rather
 * than being deleted.
 */
async function uploadAndExtract(
  agentId: string,
  file: File,
): Promise<UploadResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  if (!(file instanceof File)) return { ok: false, error: "Invalid file." };

  const path = `${user.id}/${agentId}/${objectKeySegment(file.name)}`;
  const result = await uploadAndExtractToBucket({
    bucket: STORAGE_BUCKET,
    path,
    file,
  });
  if (!result.ok) {
    return { ok: false, error: uploadErrorToMessage(result.error) };
  }
  return { ok: true, attachment: result.attachment };
}

/**
 * Create-mode upload. Form pre-allocates agent_id; this action uploads
 * to <user_id>/<agent_id>/... and extracts text. No agent_attachments
 * row is inserted — the row inserts atomically inside createAgentAction
 * when the form is submitted.
 */
export async function uploadAttachmentDraftAction(
  formData: FormData,
): Promise<UploadResult> {
  const parsedId = idSchema.safeParse({
    agent_id: formData.get("agent_id"),
  });
  if (!parsedId.success) {
    return { ok: false, error: "Invalid request." };
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Missing file." };
  }
  return uploadAndExtract(parsedId.data.agent_id, file);
}

/**
 * Edit-mode upload. Uploads + extracts + inserts the agent_attachments
 * row in one round trip. Returns the new row's id so the form can
 * remove it from the list later without a refetch. RLS gates the
 * insert via the agent_attachments_user_owns policy from 0007 — the
 * agent must exist and be owned by the user.
 */
export async function addAttachmentAction(
  formData: FormData,
): Promise<AddResult> {
  const parsedId = idSchema.safeParse({
    agent_id: formData.get("agent_id"),
  });
  if (!parsedId.success) {
    return { ok: false, error: "Invalid request." };
  }
  const agentId = parsedId.data.agent_id;
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Missing file." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return { ok: false, error: "Could not load your profile." };
  }

  const { count } = await supabase
    .from("agent_attachments")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .is("deleted_at", null);
  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_AGENT) {
    return {
      ok: false,
      error: `An agent can have at most ${MAX_ATTACHMENTS_PER_AGENT} attachments.`,
    };
  }

  const upload = await uploadAndExtract(agentId, file);
  if (!upload.ok) return upload;
  const meta = upload.attachment;

  const { data: inserted, error: insertErr } = await supabase
    .from("agent_attachments")
    .insert({
      agent_id: agentId,
      user_id: user.id,
      organization_id: profile.organization_id,
      storage_path: meta.storagePath,
      original_filename: meta.originalFilename,
      content_type: meta.contentType,
      size_bytes: meta.sizeBytes,
      extracted_text: meta.extractedText,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    console.error("agent_attachments insert failed", {
      code: insertErr?.code,
    });
    // Best-effort cleanup of the storage object since the row didn't
    // land. RLS allows the user to delete their own object.
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([meta.storagePath])
      .catch(() => {
        /* swallow — orphan-cleanup cron handles it */
      });
    return { ok: false, error: "Could not attach file. Try again." };
  }

  revalidatePath(`/workspace/agents/${agentId}/edit`);
  return { ok: true, attachmentId: inserted.id, metadata: meta };
}

/**
 * Create-mode draft removal. Deletes only the storage object — there is
 * no agent_attachments row to clean up since draft uploads don't create
 * one. The form drops the entry from its pending-list state on success.
 */
export async function removeAttachmentDraftAction(
  formData: FormData,
): Promise<RemoveResult> {
  const parsed = removeDraftSchema.safeParse({
    storage_path: formData.get("storage_path"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // The storage policies (0008) enforce path[1] = auth.uid()::text, so
  // a user can't reach into another user's draft path. Defense in
  // depth: pre-check the prefix here too with a clear error.
  if (!parsed.data.storage_path.startsWith(`${user.id}/`)) {
    return { ok: false, error: "Invalid request." };
  }

  const { error: removeErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([parsed.data.storage_path]);
  if (removeErr) {
    console.error("draft attachment remove failed", {
      code: removeErr.message,
    });
    return { ok: false, error: "Could not remove file. Try again." };
  }
  return { ok: true };
}

/**
 * Edit-mode bound removal. Soft-deletes the agent_attachments row via
 * deleted_at = now() AND deletes the storage object. The row stays in
 * the DB until a future hard-delete cron sweeps it; the storage object
 * is removed immediately because there's no undo for attachments
 * (uploads replace, no history per architecture §3).
 *
 * RLS gates the UPDATE via agent_attachments_user_owns from 0007.
 */
export async function removeAttachmentAction(
  formData: FormData,
): Promise<RemoveResult> {
  const parsed = removeSchema.safeParse({
    attachment_id: formData.get("attachment_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: row } = await supabase
    .from("agent_attachments")
    .select("id, agent_id, storage_path, user_id, deleted_at")
    .eq("id", parsed.data.attachment_id)
    .maybeSingle();
  if (!row || row.user_id !== user.id) {
    return {
      ok: false,
      error: "You don't have permission to remove this attachment.",
    };
  }
  if (row.deleted_at !== null) {
    return { ok: false, error: "This attachment is already removed." };
  }

  const { error: updateErr } = await supabase
    .from("agent_attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", row.id);
  if (updateErr) {
    console.error("agent_attachments soft-delete failed", {
      code: updateErr.code,
    });
    return { ok: false, error: "Could not remove attachment. Try again." };
  }

  // Best-effort storage object cleanup. If this fails the row is still
  // soft-deleted and the chat route filters it out by deleted_at.
  await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([row.storage_path])
    .catch((err) => {
      console.error("storage remove failed (non-fatal)", err);
    });

  revalidatePath(`/workspace/agents/${row.agent_id}/edit`);
  return { ok: true };
}
