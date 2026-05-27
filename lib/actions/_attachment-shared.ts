import "server-only";

import {
  ALLOWED_MIME_TYPES,
  extractText,
  type AllowedMimeType,
} from "@/lib/extract/extract";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Helpers shared by the two attachment surfaces — permanent agent
 * attachments (lib/actions/attachments.ts) and per-message chat
 * attachments (lib/actions/message-attachments.ts). Both upload to a private
 * Supabase Storage bucket under a `<user_id>/…` path and cache extracted text;
 * only the bucket, the path scheme, and the row I/O differ. Everything that's
 * genuinely common lives here so the two surfaces share one implementation.
 *
 * server-only: this module touches Storage and runs extraction. Type-only
 * imports of `AttachmentMetadata` from here (e.g. by client components via the
 * re-export in attachments.ts) are erased at build time and don't pull the
 * runtime in.
 */

/**
 * 20MB per-file cap. Enforced client-side (UX), here (defense in depth), and
 * at the bucket level (file_size_limit in migration 0008) as the last line.
 */
export const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Metadata returned by {@link uploadAndExtractToBucket}, shared by the agent
 * and message attachment surfaces. `extractedText` is null (and
 * `extractionWarning` set) when the file uploaded but yielded no readable text
 * — the caller decides how to surface that.
 */
export type AttachmentMetadata = {
  storagePath: string;
  originalFilename: string;
  contentType: AllowedMimeType;
  sizeBytes: number;
  extractedText: string | null;
  extractionWarning: string | null;
};

/**
 * File-level rejection reasons from {@link uploadAndExtractToBucket}. Callers
 * map these to their own user-facing surfaces — human-readable copy for agent
 * attachments, typed error codes for message attachments.
 */
export type AttachmentUploadError =
  | "file_empty"
  | "file_too_large"
  | "unsupported_type"
  | "internal_error";

export type BucketUploadResult =
  | { ok: true; attachment: AttachmentMetadata }
  | { ok: false; error: AttachmentUploadError };

/**
 * Sanitize a user-provided filename into a storage-key-safe segment. The
 * original filename is preserved separately (in the row's original_filename)
 * for display; this is just the key form. A short random suffix prevents
 * collisions when the same name is uploaded twice.
 */
export function objectKeySegment(filename: string): string {
  const base =
    filename
      .toLowerCase()
      .replace(/\.[^.]+$/, "") // strip extension
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file";
  const suffix = Math.random().toString(36).slice(2, 8);
  const ext = filename.match(/\.[^.]+$/)?.[0] ?? "";
  return `${base}-${suffix}${ext.toLowerCase()}`;
}

export function isAllowedMime(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Validate a file (empty / size / MIME), upload it to `bucket` at `path`, and
 * extract its text. Bucket- and path-parametrized: knows nothing about agents
 * vs messages — the caller builds the path (with its own id scheme) and owns
 * any row insert/delete.
 *
 * `file` is assumed to be a real File (callers verify presence). On an
 * extraction failure the upload is kept and the result carries
 * `extractedText: null` + `extractionWarning`, so the caller can show the file
 * with a warning rather than silently dropping it.
 */
export async function uploadAndExtractToBucket(opts: {
  bucket: string;
  path: string;
  file: File;
}): Promise<BucketUploadResult> {
  const { bucket, path, file } = opts;

  if (file.size === 0) return { ok: false, error: "file_empty" };
  if (file.size > MAX_BYTES) return { ok: false, error: "file_too_large" };
  if (!isAllowedMime(file.type)) return { ok: false, error: "unsupported_type" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = await createSupabaseServerClient();

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    console.error("attachment upload failed", {
      bucket,
      code: uploadErr.message,
    });
    return { ok: false, error: "internal_error" };
  }

  const base = {
    storagePath: path,
    originalFilename: file.name,
    contentType: file.type as AllowedMimeType,
    sizeBytes: file.size,
  };

  const extraction = await extractText(buffer, file.type);
  if (!extraction.ok) {
    return {
      ok: true,
      attachment: { ...base, extractedText: null, extractionWarning: extraction.reason },
    };
  }
  return {
    ok: true,
    attachment: { ...base, extractedText: extraction.text, extractionWarning: null },
  };
}
