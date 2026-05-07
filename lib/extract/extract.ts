import "server-only";

import { extractDocxText } from "./docx";
import { extractPdfText } from "./pdf";
import { extractTextFile } from "./text";
import { extractXlsxText } from "./xlsx";

export const ATTACHMENT_TEXT_LIMIT = 100_000;
export const TRUNCATION_NOTE =
  "\n\n[This document was truncated to its first 100,000 characters.]";

/**
 * Allowed attachment MIME types matching the agent-attachments storage
 * bucket allowlist (migration 0008) and the v1 format set in
 * docs/AGENT_ARCHITECTURE.md §3. Storage layer also enforces this; the
 * application check is for a clearer error message.
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export type ExtractionResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: string };

/**
 * Extract text from a file's binary contents based on its MIME type.
 * Dispatches to the per-format extractor; truncates at ATTACHMENT_TEXT_LIMIT
 * with a readable note appended so the model has explicit context that
 * more existed.
 *
 * Errors from the underlying libraries — unpdf on malformed PDFs,
 * mammoth on corrupt DOCX, xlsx on unsupported sheet types — bubble up as
 * { ok: false, reason }. The caller surfaces this through the standard
 * "Couldn't extract text" UX path; the storage object itself stays at
 * its uploaded path so the user can see the failed file in their list
 * and remove it.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  let raw: string;
  try {
    switch (mimeType) {
      case "application/pdf":
        raw = await extractPdfText(buffer);
        break;
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        raw = await extractDocxText(buffer);
        break;
      case "text/plain":
      case "text/markdown":
        raw = extractTextFile(buffer);
        break;
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        raw = extractXlsxText(buffer);
        break;
      default:
        return { ok: false, reason: "Unsupported file type." };
    }
  } catch (err) {
    console.error("extractText failed", { mimeType, err });
    return { ok: false, reason: "Could not read file contents." };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "No readable text found in file." };
  }

  if (trimmed.length > ATTACHMENT_TEXT_LIMIT) {
    return {
      ok: true,
      text: trimmed.slice(0, ATTACHMENT_TEXT_LIMIT) + TRUNCATION_NOTE,
      truncated: true,
    };
  }
  return { ok: true, text: trimmed, truncated: false };
}
