import "server-only";

import { PDFParse } from "pdf-parse";

/**
 * Extract text from a PDF buffer using pdf-parse v2's PDFParse class.
 * pdf-parse v2 changed from a default-export function to a class API
 * with a getText() method on a per-document instance; this wrapper
 * shields callers from that detail.
 *
 * Both thrown errors (malformed PDFs, encrypted documents the library
 * cannot open) and empty returns (image-only scanned PDFs with no
 * extractable text layer) are handled by the dispatcher in extract.ts:
 * thrown errors bubble up via the try/catch, and empty / whitespace-only
 * returns are caught by the post-extraction trim check. OCR is deferred
 * per architecture §3.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}
