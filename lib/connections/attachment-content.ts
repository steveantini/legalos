import "server-only";

import { canExerciseCapability } from "@/lib/connections/policy";
import {
  DriveContentError,
  fetchDriveFileContent,
} from "@/lib/connections/providers/google-drive-content";
import {
  getUsableAccessToken,
  TokenUnavailableError,
} from "@/lib/connections/tokens";
import { extractText } from "@/lib/extract/extract";

/**
 * The single attachment-content resolution seam (M6a, D-067). Both chat-route
 * loaders (agent attachments and message attachments) call this so block
 * assembly stays uniform across sources.
 *
 *   - 'upload' (or legacy null): today's path exactly — the already-extracted
 *     text the caller holds (cached for agent attachments, re-extracted from
 *     Storage for message attachments). No behavior change for uploads.
 *   - 'gdrive_link': resolved LIVE at run-time — gated by the M5 capability gate
 *     (canExerciseCapability, this being its first consumer), then a usable
 *     token (token-exercise layer), then a Drive content fetch (binary or native
 *     export), then the SAME extractText() used for uploads. Always the current
 *     Drive file, never a snapshot.
 *
 * A gdrive_link row that can't be resolved (policy denied, token unavailable,
 * file deleted, access revoked, Drive unreachable, too large, unsupported)
 * returns `unavailable` so the caller can surface the attachment as unavailable
 * without failing the agent turn. Token material is never logged.
 *
 * NOTE: only `agent_attachments` carries source_type/source_metadata today
 * (migration 0007). `message_attachments` has no such columns, so message rows
 * always resolve as 'upload'; per-message Drive attachments need a migration
 * (flagged in M6a, not added here).
 */

const FILE_STORAGE_CATEGORY = "file-storage";

/** An attachment row normalized for resolution, source-agnostic. */
export type ResolvableAttachment = {
  /** 'upload' | 'gdrive_link' | null (legacy uploads predate the column). */
  sourceType: string | null;
  /** jsonb source_metadata; for gdrive_link, expected `{ "fileId": "<id>" }`. */
  sourceMetadata: unknown;
  originalFilename: string;
  /** Already-extracted text for uploads; ignored for gdrive_link. */
  cachedText: string | null;
};

/**
 * The resolution outcome. `omit` produces no block (an upload with empty/failed
 * extraction — today's behavior); `unavailable` produces an unavailable-status
 * block (a gdrive_link that couldn't be read); `text` produces a normal block.
 */
export type ResolvedAttachment =
  | { kind: "text"; text: string }
  | { kind: "omit" }
  | { kind: "unavailable" };

export async function resolveAttachmentText(
  attachment: ResolvableAttachment,
  userId: string,
): Promise<ResolvedAttachment> {
  if (attachment.sourceType !== "gdrive_link") {
    // Upload / legacy: use the cached text, omit when empty (unchanged).
    const text = attachment.cachedText;
    return text && text.trim().length > 0
      ? { kind: "text", text }
      : { kind: "omit" };
  }

  const fileId = extractDriveFileId(attachment.sourceMetadata);
  if (!fileId) {
    console.error("drive attachment missing file id");
    return { kind: "unavailable" };
  }

  // Govern before exercise: the M5 gate (first consumer here). Carries the
  // connectionId + tokenRef on allow.
  const decision = await canExerciseCapability(userId, FILE_STORAGE_CATEGORY, "read");
  if (!decision.allowed) {
    console.error("drive attachment denied", { reason: decision.reason });
    return { kind: "unavailable" };
  }
  if (!decision.tokenRef) {
    console.error("drive attachment has no token reference", {
      connectionId: decision.connectionId,
    });
    return { kind: "unavailable" };
  }

  try {
    const accessToken = await getUsableAccessToken(
      decision.connectionId,
      decision.tokenRef,
    );
    const content = await fetchDriveFileContent(accessToken, fileId);
    const extraction = await extractText(content.bytes, content.mimeType);
    if (!extraction.ok) {
      console.error("drive attachment extraction failed", {
        connectionId: decision.connectionId,
      });
      return { kind: "unavailable" };
    }
    return { kind: "text", text: extraction.text };
  } catch (err) {
    console.error("drive attachment unavailable", {
      connectionId: decision.connectionId,
      reason: classifyReason(err),
    });
    return { kind: "unavailable" };
  }
}

// Accept the canonical `fileId`, plus `file_id`/`id` variants, from the jsonb.
function extractDriveFileId(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object") {
    const record = metadata as Record<string, unknown>;
    const candidate = record.fileId ?? record.file_id ?? record.id;
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

// Generic reason string for logging — never token material.
function classifyReason(err: unknown): string {
  if (err instanceof TokenUnavailableError) return `token_${err.reason}`;
  if (err instanceof DriveContentError) return `drive_${err.reason}`;
  return "unknown_error";
}
