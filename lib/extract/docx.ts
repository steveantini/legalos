import "server-only";

import mammoth from "mammoth";

/**
 * Extract plain text from a DOCX buffer via mammoth's extractRawText.
 * mammoth handles the OOXML parsing, normalizes whitespace, and ignores
 * styling — exactly what we want when the goal is to feed prose to a
 * model. Tables come through as tab-separated rows; image content is
 * silently dropped (no OCR in v1).
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}
