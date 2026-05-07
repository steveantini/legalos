import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract text from a PDF buffer using `unpdf`, which ships a serverless-
 * tuned PDF.js build with no native deps and no dynamic requires.
 * Replaces `pdf-parse` (Session 22) — see `next.config.ts` for the
 * failure mode that motivated the swap.
 *
 * Both thrown errors (malformed PDFs, encrypted documents the library
 * cannot open) and empty returns (image-only scanned PDFs with no
 * extractable text layer) are handled by the dispatcher in extract.ts:
 * thrown errors bubble up via the try/catch, and empty / whitespace-only
 * returns are caught by the post-extraction trim check. OCR is deferred
 * per architecture §3.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text ?? "";
}
