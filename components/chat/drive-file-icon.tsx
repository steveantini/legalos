import {
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  PresentationIcon,
} from "lucide-react";

import type { DriveIconType } from "@/lib/connections/providers/google-drive-listing";

/**
 * Maps the listing layer's coarse {@link DriveIconType} to a lucide glyph and a
 * human type label, for the picker rows and the Drive attachment chip. The
 * iconType itself is derived server-side (single source of truth, M6c1); this is
 * the presentation half — glyph + label only, no mime logic.
 *
 * Functional icons: the glyph distinguishes Doc / Sheet / Slides / PDF / folder
 * at a glance, which is information, not decoration (the no-decorative-icons
 * discipline still holds). lucide carries no distinct PDF mark, so PDFs use the
 * document glyph; the type label disambiguates.
 */
const ICONS: Record<
  DriveIconType,
  React.ComponentType<{ className?: string }>
> = {
  folder: FolderIcon,
  doc: FileTextIcon,
  document: FileTextIcon,
  sheet: FileSpreadsheetIcon,
  spreadsheet: FileSpreadsheetIcon,
  slides: PresentationIcon,
  pdf: FileTextIcon,
  other: FileIcon,
};

const TYPE_LABELS: Record<DriveIconType, string> = {
  folder: "Folder",
  doc: "Google Doc",
  document: "Word document",
  sheet: "Google Sheet",
  spreadsheet: "Spreadsheet",
  slides: "Google Slides",
  pdf: "PDF",
  other: "File",
};

export function DriveFileIcon({
  iconType,
  className,
}: {
  iconType: DriveIconType;
  className?: string;
}) {
  const Icon = ICONS[iconType] ?? FileIcon;
  return <Icon className={className} />;
}

export function driveTypeLabel(iconType: DriveIconType): string {
  return TYPE_LABELS[iconType] ?? "File";
}
