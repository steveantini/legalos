import "server-only";

/**
 * Extract text from a TXT or MD buffer. UTF-8 is the assumed encoding;
 * non-UTF-8 input will produce replacement characters, which is the
 * correct fallback (the alternative — guess the encoding — is fragile).
 *
 * No format-specific transformation: markdown preserves its source
 * formatting (the model handles markdown natively); plain text passes
 * through verbatim.
 */
export function extractTextFile(buffer: Buffer): string {
  return buffer.toString("utf-8");
}
