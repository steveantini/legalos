/**
 * CSV exports for the adoption metrics surface. Per D-019 (extended in
 * this same commit), the original's three "Create Report" placeholder
 * buttons (`alert('Report export functionality coming soon!')` at
 * admin.html lines 1022, 1110, and 1165) are wired to real downloads.
 * The calculator's was wired in the Session 5 fix; the Top Users and
 * Clicks per Agent versions are wired here.
 *
 * Pattern matches the calculator (data:text/csv URI + temporary
 * anchor click) so the download UX is identical across the admin
 * surface. Filenames follow `<scope>_<period>_<mode>.csv`.
 */

import type { ClicksRow, Period, TopUserRow } from "@/lib/metrics/types";

type Mode = "sample" | "real";

function escapeField(field: string): string {
  // Strip commas to match the calculator's CSV pattern (the source
  // calculator's exporter does `.replace(/,/g, '')` on text fields).
  return field.replace(/,/g, "");
}

export function buildTopUsersCsv(
  rows: TopUserRow[],
  period: Period,
  mode: Mode,
): string {
  let csv = "data:text/csv;charset=utf-8,";
  csv += "Rank,User,Interactions,Most Used Agent,Period,Source\n";
  for (const row of rows) {
    csv +=
      row.rank +
      "," +
      escapeField(row.user) +
      "," +
      row.interactions +
      "," +
      escapeField(row.agent) +
      "," +
      period +
      "," +
      mode +
      "\n";
  }
  return csv;
}

export function buildClicksByAgentCsv(
  rows: ClicksRow[],
  period: Period,
  mode: Mode,
): string {
  let csv = "data:text/csv;charset=utf-8,";
  csv += "Agent,Clicks,Period,Source\n";
  for (const row of rows) {
    csv += escapeField(row.label) + "," + row.value + "," + period + "," + mode + "\n";
  }
  return csv;
}

export function topUsersFilename(period: Period, mode: Mode): string {
  return `top_users_${period}_${mode}.csv`;
}

export function clicksByAgentFilename(period: Period, mode: Mode): string {
  return `clicks_per_agent_${period}_${mode}.csv`;
}

export function triggerDownload(csvDataUri: string, filename: string): void {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvDataUri));
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
