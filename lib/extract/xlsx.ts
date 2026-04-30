import "server-only";

import * as XLSX from "xlsx";

/**
 * Extract text from an XLSX buffer. Each sheet renders as a labeled
 * CSV-ish block so the model can distinguish multi-sheet workbooks
 * ("Sheet: <name>" header before each section). Empty cells render as
 * empty fields; date / number formatting follows SheetJS defaults.
 *
 * SheetJS's `sheet_to_csv` is the right choice for model consumption
 * over `sheet_to_json` — preserves cell-position context that prose-
 * style serialization loses.
 */
export function extractXlsxText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim().length === 0) continue;
    parts.push(`Sheet: ${sheetName}\n${csv}`);
  }
  return parts.join("\n\n");
}
