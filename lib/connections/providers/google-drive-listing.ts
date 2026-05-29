import "server-only";

import { canExerciseCapability } from "@/lib/connections/policy";
import { NATIVE_EXPORT_TARGETS } from "@/lib/connections/providers/google-drive-content";
import { getUsableAccessToken } from "@/lib/connections/tokens";
import { ALLOWED_MIME_TYPES } from "@/lib/extract/extract";

/**
 * Google Drive listing/search layer (M6c1, D-069): the read-only data source the
 * upcoming Drive file picker (M6c2) renders. It DISCOVERS files — recents on
 * open, global search by name, folder browsing, and breadcrumb path resolution —
 * a different Drive capability than the M6a content client, which fetches a
 * single known file's bytes. The two are sibling modules sharing this repo's
 * auth, token, and error patterns; content-fetch is untouched.
 *
 * Every function follows govern-before-exercise: it calls canExerciseCapability
 * FIRST (the same file-storage/read gate the content client uses) and touches
 * Drive only on allow, then mints a fresh token via the token-exercise layer.
 * The drive.readonly scope (M4a) already covers files.list / files.get / export,
 * so there is no new scope, env, or migration.
 *
 * All failures are typed so the picker degrades calmly (a connect prompt when not
 * authorized, a quiet "couldn't reach Drive" otherwise) and never crashes a
 * render. Token material is never logged — at most a generic operation + outcome.
 *
 * v1 returns a single capped page per call: recents, search, and folder contents
 * at a sane cap cover the picker experience. Deep pagination is a later additive
 * refinement (a folder larger than the cap returns its first page).
 */

// Drive API v3. Stable base; the content client uses the same endpoint.
const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_STORAGE_CATEGORY = "file-storage";

// Defaults sized for the picker: recents/search are scannable lists; a folder
// view can hold more. Drive caps pageSize at 1000; we clamp defensively.
const DEFAULT_RECENT_LIMIT = 25;
const DEFAULT_SEARCH_LIMIT = 25;
const DEFAULT_FOLDER_LIMIT = 100;
const MAX_PAGE_SIZE = 1000;

// Cap the breadcrumb walk so a pathological parent cycle (or a very deep tree)
// can never loop unbounded.
const MAX_PATH_DEPTH = 20;

// Minimal field masks — request ONLY what DriveItem / the breadcrumb need, for
// performance. List results never need `parents`; only path resolution does.
const FILE_LIST_FIELDS = "files(id,name,mimeType,modifiedTime)";
const FOLDER_META_FIELDS = "id,name,parents";

// Drive's My Drive alias. We surface it as a synthetic crumb so breadcrumbs read
// "My Drive / Clients / Acme" without an extra files.get on the real root id.
const ROOT_ALIAS = "root";
const MY_DRIVE_LABEL = "My Drive";

/**
 * A coarse type key for the picker's glyph, derived from mimeType so the UI never
 * re-derives it. This module is the single source of truth for the mapping.
 */
export type DriveIconType =
  | "folder"
  | "doc" // native Google Doc
  | "sheet" // native Google Sheet
  | "slides" // native Google Slides
  | "pdf"
  | "document" // DOCX
  | "spreadsheet" // XLSX
  | "other";

/** A file or folder, shaped for the picker. */
export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  /** True when mimeType is the Drive folder type. */
  isFolder: boolean;
  /** ISO timestamp, for "edited 2h ago" display. */
  modifiedTime: string;
  /**
   * Whether the picker may offer this for attachment. TRUE for exactly the set
   * the M6a content client can resolve (allowed binaries + native Google
   * Docs/Sheets/Slides via export); FALSE for everything else. Folders are
   * navigable regardless, so they carry true. The picker greys out files where
   * this is false, so it can never offer a file that would later come back
   * unavailable.
   */
  isSupported: boolean;
  /** Coarse type for the picker's glyph; see {@link DriveIconType}. */
  iconType: DriveIconType;
};

/** One breadcrumb segment, root → folder. */
export type DriveCrumb = { id: string; name: string };

/** Why a listing call could not complete. Carries no token material or PII. */
export type DriveListErrorReason =
  | "not_authorized" // capability gate denied — not connected / policy disallows
  | "token_unavailable" // connection present but no usable access token
  | "forbidden" // 403/401 from Drive — access lost or token rejected
  | "not_found" // 404 — folder/file deleted or not visible
  | "unreachable"; // network error, 5xx, or an unparseable response

/** Discriminated result so the picker branches without try/catch. */
export type DriveListResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: DriveListErrorReason };

// ── Supported-set + icon mapping (single source of truth) ──────────────────
//
// isSupported is derived from the SAME constants the content client resolves
// against — ALLOWED_MIME_TYPES (allowed binaries) plus the native-Google export
// keys — so the picker and content-fetch cannot drift on what is attachable. The
// reconciled supported set is therefore exactly:
//   PDF, DOCX, XLSX, text/plain, text/markdown   (ALLOWED_MIME_TYPES)
//   Google Doc, Google Sheet, Google Slides       (NATIVE_EXPORT_TARGETS keys)

const ALLOWED_BINARY_MIMES: ReadonlySet<string> = new Set(ALLOWED_MIME_TYPES);
const NATIVE_SUPPORTED_MIMES: ReadonlySet<string> = new Set(
  Object.keys(NATIVE_EXPORT_TARGETS),
);

function isSupportedFile(mimeType: string): boolean {
  return ALLOWED_BINARY_MIMES.has(mimeType) || NATIVE_SUPPORTED_MIMES.has(mimeType);
}

function iconTypeForMime(mimeType: string): DriveIconType {
  switch (mimeType) {
    case FOLDER_MIME:
      return "folder";
    case "application/vnd.google-apps.document":
      return "doc";
    case "application/vnd.google-apps.spreadsheet":
      return "sheet";
    case "application/vnd.google-apps.presentation":
      return "slides";
    case "application/pdf":
      return "pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "document";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "spreadsheet";
    default:
      // Includes text/plain and text/markdown (supported, but no dedicated glyph).
      return "other";
  }
}

// ── Drive API plumbing ─────────────────────────────────────────────────────

type DriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  parents?: string[];
};
type DriveFileListResponse = { files?: DriveApiFile[] };

/** Internal control-flow error; converted to a {@link DriveListResult} at the seam. */
class DriveListError extends Error {
  constructor(readonly reason: DriveListErrorReason) {
    super(reason);
    this.name = "DriveListError";
  }
}

/**
 * Govern before exercise, then mint a token. Throws {@link DriveListError} with
 * `not_authorized` when the gate denies (the picker shows the connect prompt) or
 * `token_unavailable` when a usable token can't be produced. No Drive call has
 * happened yet at this point.
 */
async function authorizeAndGetToken(userId: string): Promise<string> {
  const decision = await canExerciseCapability(userId, FILE_STORAGE_CATEGORY, "read");
  if (!decision.allowed) {
    throw new DriveListError("not_authorized");
  }
  if (!decision.tokenRef) {
    // Active connection with no secret reference — treat as needs-reconnect.
    throw new DriveListError("token_unavailable");
  }
  try {
    return await getUsableAccessToken(decision.connectionId, decision.tokenRef);
  } catch {
    // TokenUnavailableError (revoked/expired refresh, etc.) — never log the error
    // object, which is keyed by connection but carries no token material anyway.
    throw new DriveListError("token_unavailable");
  }
}

/** A read-only Drive GET that maps transport/HTTP failures to typed reasons. */
async function driveGetJson(url: string, accessToken: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new DriveListError("unreachable");
  }
  if (!response.ok) {
    if (response.status === 404) throw new DriveListError("not_found");
    if (response.status === 401 || response.status === 403) {
      throw new DriveListError("forbidden");
    }
    // 5xx and anything else: unknown/transient. The body may carry an error
    // description but is not logged here (the seam logs the reason only).
    throw new DriveListError("unreachable");
  }
  try {
    return await response.json();
  } catch {
    throw new DriveListError("unreachable");
  }
}

/**
 * Run a listing operation and fold any {@link DriveListError} into the result
 * union, so callers never see a thrown error. Logs a generic operation + reason
 * (never token material, never file contents).
 */
async function asResult<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<DriveListResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const reason: DriveListErrorReason =
      err instanceof DriveListError ? err.reason : "unreachable";
    console.error("drive listing failed", { operation, reason });
    return { ok: false, reason };
  }
}

// Drive query-string values are single-quoted; a literal backslash or single
// quote inside the value must be escaped, or the q parameter breaks. Backslash
// first so the quote-escape's backslash is not itself doubled.
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function clampPageSize(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.max(1, Math.min(Math.floor(limit), MAX_PAGE_SIZE));
}

/** Build a files.list URL with the minimal field mask and shared-drive support. */
function buildListUrl(params: {
  q: string;
  orderBy: string;
  pageSize: number;
}): string {
  const search = new URLSearchParams({
    q: params.q,
    orderBy: params.orderBy,
    pageSize: String(params.pageSize),
    fields: FILE_LIST_FIELDS,
    // Surface shared-drive items too; the content client fetches with
    // supportsAllDrives=true, so anything listed here remains fetchable.
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  return `${DRIVE_FILES_ENDPOINT}?${search.toString()}`;
}

function toDriveItem(raw: DriveApiFile): DriveItem | null {
  if (!raw.id) return null;
  const mimeType = raw.mimeType ?? "";
  const isFolder = mimeType === FOLDER_MIME;
  return {
    id: raw.id,
    name: raw.name ?? "Untitled",
    mimeType,
    isFolder,
    modifiedTime: raw.modifiedTime ?? "",
    isSupported: isFolder ? true : isSupportedFile(mimeType),
    iconType: iconTypeForMime(mimeType),
  };
}

function parseFileList(json: unknown): DriveItem[] {
  const files = (json as DriveFileListResponse).files ?? [];
  return files.map(toDriveItem).filter((item): item is DriveItem => item !== null);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * The picker's open state: the user's most-recently-modified files (folders
 * excluded — recents are about files you have touched), newest first, capped.
 */
export async function listRecentFiles(
  userId: string,
  limit: number = DEFAULT_RECENT_LIMIT,
): Promise<DriveListResult<DriveItem[]>> {
  return asResult("listRecentFiles", async () => {
    const token = await authorizeAndGetToken(userId);
    const url = buildListUrl({
      q: `trashed = false and mimeType != '${FOLDER_MIME}'`,
      orderBy: "modifiedTime desc",
      pageSize: clampPageSize(limit),
    });
    return parseFileList(await driveGetJson(url, token));
  });
}

/**
 * Global search by name. Folders matching the query are included (marked
 * isFolder) so a user can jump straight to a folder by searching its name; the
 * picker renders those as navigable. An empty/whitespace query returns no items
 * without touching Drive.
 */
export async function searchFiles(
  userId: string,
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): Promise<DriveListResult<DriveItem[]>> {
  return asResult("searchFiles", async () => {
    const token = await authorizeAndGetToken(userId);
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    const url = buildListUrl({
      q: `name contains '${escapeDriveQueryValue(trimmed)}' and trashed = false`,
      orderBy: "modifiedTime desc",
      pageSize: clampPageSize(limit),
    });
    return parseFileList(await driveGetJson(url, token));
  });
}

/**
 * Browse a folder: its direct children, subfolders first then files (Drive's
 * `folder` sort key), each group alphabetical. Pass 'root' for My Drive's top
 * level. A folder larger than the cap returns its first page (v1; no pagination).
 */
export async function listFolderContents(
  userId: string,
  folderId: string,
  limit: number = DEFAULT_FOLDER_LIMIT,
): Promise<DriveListResult<DriveItem[]>> {
  return asResult("listFolderContents", async () => {
    const token = await authorizeAndGetToken(userId);
    const url = buildListUrl({
      q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
      // `folder` sorts folders ahead of files; `name` orders each group A→Z.
      orderBy: "folder,name",
      pageSize: clampPageSize(limit),
    });
    return parseFileList(await driveGetJson(url, token));
  });
}

/**
 * Resolve a folder's ancestor chain for the clickable breadcrumb, ordered root →
 * folder, e.g. [{root, "My Drive"}, {id, "Clients"}, {id, "Acme"}]. Walks up the
 * parents chain (capped at MAX_PATH_DEPTH) and prepends a synthetic My Drive
 * crumb once the real root is reached.
 *
 * Authorization failures return { ok: false } (the picker shows the connect
 * prompt). A Drive failure MID-WALK degrades gracefully instead: the breadcrumb
 * is non-critical, so we return { ok: true } with as much of the path as we could
 * resolve (possibly empty), never failing the whole picker over a missing crumb.
 */
export async function getFolderPath(
  userId: string,
  folderId: string,
): Promise<DriveListResult<DriveCrumb[]>> {
  return asResult("getFolderPath", async () => {
    const token = await authorizeAndGetToken(userId);
    if (folderId === ROOT_ALIAS) {
      return [{ id: ROOT_ALIAS, name: MY_DRIVE_LABEL }];
    }
    return resolveFolderPath(token, folderId);
  });
}

// Walk parents up to My Drive. Any per-hop Drive failure stops the walk and
// returns what we have (graceful) — only the pre-Drive authorization step can
// fail the whole call. A synthetic My Drive crumb is prepended ONLY when we
// actually reached the parentless root, so an inaccessible/shared ancestor is
// not mislabeled as My Drive.
async function resolveFolderPath(
  accessToken: string,
  folderId: string,
): Promise<DriveCrumb[]> {
  const chain: DriveCrumb[] = [];
  let currentId = folderId;
  let reachedRoot = false;

  for (let depth = 0; depth < MAX_PATH_DEPTH; depth++) {
    const meta = await fetchFolderMetaOrNull(accessToken, currentId);
    if (!meta || !meta.id) break;

    const parents = meta.parents;
    if (!parents || parents.length === 0) {
      // No parents → this is the root folder itself. Represent it as the
      // synthetic My Drive crumb rather than its real id/name.
      reachedRoot = true;
      break;
    }

    chain.unshift({ id: meta.id, name: meta.name ?? "Untitled" });
    currentId = parents[0];
  }

  return reachedRoot ? [{ id: ROOT_ALIAS, name: MY_DRIVE_LABEL }, ...chain] : chain;
}

// One folder's metadata for the walk. Returns null on ANY failure so the
// breadcrumb degrades gracefully rather than throwing.
async function fetchFolderMetaOrNull(
  accessToken: string,
  folderId: string,
): Promise<DriveApiFile | null> {
  const url = `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(folderId)}?fields=${FOLDER_META_FIELDS}&supportsAllDrives=true`;
  try {
    return (await driveGetJson(url, accessToken)) as DriveApiFile;
  } catch {
    return null;
  }
}
