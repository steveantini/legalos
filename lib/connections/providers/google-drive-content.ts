import "server-only";

import { MAX_BYTES } from "@/lib/actions/_attachment-shared";
import { ALLOWED_MIME_TYPES, type AllowedMimeType } from "@/lib/extract/extract";

/**
 * Google Drive content client (M6a, D-067): fetches a Drive file's bytes for
 * live read at agent run-time, handling BOTH normal binaries and native Google
 * formats.
 *
 *   - Normal binary (PDF, DOCX, XLSX, text/markdown): downloaded via
 *     files.get?alt=media.
 *   - Native Google format (Docs/Sheets/Slides): NOT alt=media-downloadable;
 *     exported via files.export to a text-bearing format the existing extractor
 *     handles — Docs→DOCX, Sheets→XLSX, Slides→PDF.
 *
 * The drive.readonly scope (M4a) covers both files.get and files.export. The
 * 20MB size cap and the MIME allowlist are enforced AFTER fetch/export, before
 * extraction. All failures are typed so the caller can surface the attachment
 * as unavailable without failing the turn. Token material is never logged.
 */

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

// Native Google MIME → the export target MIME (which must be in the extractor
// allowlist). Docs→DOCX and Sheets→XLSX extract cleanly; Slides has no native
// text extractor, so PDF export is the baseline text-bearing form.
const NATIVE_EXPORT_TARGETS: Record<string, AllowedMimeType> = {
  "application/vnd.google-apps.document":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.spreadsheet":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.google-apps.presentation": "application/pdf",
};

/** Why a Drive file could not be fetched. Carries no token material. */
export type DriveContentErrorReason =
  | "metadata_failed" // could not read file metadata
  | "not_found" // 404 — deleted or no access to this id
  | "forbidden" // 403/401 — access lost or token rejected
  | "unreachable" // network error or 5xx
  | "too_large" // exceeds the 20MB cap after fetch
  | "unsupported_type"; // post-fetch/export MIME not in the allowlist

/** Typed failure so the resolver degrades gracefully (attachment unavailable). */
export class DriveContentError extends Error {
  constructor(
    readonly reason: DriveContentErrorReason,
    readonly fileId: string,
  ) {
    super(reason);
    this.name = "DriveContentError";
  }
}

/** Fetched Drive content, ready to feed the existing text extractor. */
export type DriveFileContent = {
  bytes: Buffer;
  /** The MIME to dispatch extraction on — the EXPORT target for native formats. */
  mimeType: AllowedMimeType;
  /** The Drive file's display name. */
  filename: string;
};

type DriveMetadata = {
  name?: string;
  mimeType?: string;
  size?: string;
};

async function driveGet(
  url: string,
  accessToken: string,
  fileId: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new DriveContentError("unreachable", fileId);
  }
  if (response.ok) return response;
  if (response.status === 404) throw new DriveContentError("not_found", fileId);
  if (response.status === 403 || response.status === 401) {
    throw new DriveContentError("forbidden", fileId);
  }
  // 5xx and any other status: treat as unreachable/unknown. The body may carry
  // an error description but is not logged here (the caller logs the reason).
  throw new DriveContentError("unreachable", fileId);
}

/**
 * Fetch a Drive file's content as bytes plus the MIME to extract it with. Native
 * Google formats are exported; binaries are downloaded directly. Enforces the
 * size cap and MIME allowlist after fetch.
 */
export async function fetchDriveFileContent(
  accessToken: string,
  fileId: string,
): Promise<DriveFileContent> {
  const encodedId = encodeURIComponent(fileId);

  // 1. Metadata — learn the real MIME, name, and (for binaries) size.
  const metaResponse = await driveGet(
    `${DRIVE_FILES_ENDPOINT}/${encodedId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
    accessToken,
    fileId,
  );
  let metadata: DriveMetadata;
  try {
    metadata = (await metaResponse.json()) as DriveMetadata;
  } catch {
    throw new DriveContentError("metadata_failed", fileId);
  }
  const sourceMime = metadata.mimeType ?? "";
  const filename = metadata.name ?? "Drive file";

  const exportTarget = NATIVE_EXPORT_TARGETS[sourceMime];

  let bytes: Buffer;
  let resultMime: string;

  if (exportTarget) {
    // Native Google format → export to a text-bearing format.
    const response = await driveGet(
      `${DRIVE_FILES_ENDPOINT}/${encodedId}/export?mimeType=${encodeURIComponent(exportTarget)}&supportsAllDrives=true`,
      accessToken,
      fileId,
    );
    bytes = Buffer.from(await response.arrayBuffer());
    resultMime = exportTarget;
  } else if (sourceMime.startsWith("application/vnd.google-apps")) {
    // A native Google type with no export mapping (Forms, Drawings, etc.).
    throw new DriveContentError("unsupported_type", fileId);
  } else {
    // Normal binary → cheap size pre-check from metadata, then alt=media.
    const declaredSize = metadata.size ? Number(metadata.size) : null;
    if (declaredSize !== null && declaredSize > MAX_BYTES) {
      throw new DriveContentError("too_large", fileId);
    }
    const response = await driveGet(
      `${DRIVE_FILES_ENDPOINT}/${encodedId}?alt=media&supportsAllDrives=true`,
      accessToken,
      fileId,
    );
    bytes = Buffer.from(await response.arrayBuffer());
    resultMime = sourceMime;
  }

  // Post-fetch enforcement (export responses report no metadata size).
  if (bytes.byteLength > MAX_BYTES) {
    throw new DriveContentError("too_large", fileId);
  }
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(resultMime)) {
    throw new DriveContentError("unsupported_type", fileId);
  }

  return { bytes, mimeType: resultMime as AllowedMimeType, filename };
}
