"use server";

import { requireAuthUser } from "@/lib/auth/access";
import {
  getFolderPath,
  listFolderContents,
  listRecentFiles,
  searchFiles,
  type DriveCrumb,
  type DriveItem,
  type DriveListResult,
} from "@/lib/connections/providers/google-drive-listing";

/**
 * Server-action seam for the Drive file picker (M6c2).
 *
 * The M6c1 listing functions are server-only (they exercise OAuth tokens), so
 * the client picker reaches them through these thin actions: authenticate the
 * session, then delegate, returning the listing layer's typed DriveListResult
 * unchanged. The picker branches on the result's discriminants (`not_authorized`
 * → connect prompt, the rest → calm inline errors) and never sees a token.
 *
 * No new policy or capability logic here — canExerciseCapability runs inside the
 * listing functions. Inputs are coerced to safe strings and the folder id falls
 * back to the root alias; the listing layer escapes them for the Drive query.
 */

const ROOT_FOLDER = "root";
const MAX_QUERY_LENGTH = 200;

function coerceQuery(value: string): string {
  return typeof value === "string" ? value.slice(0, MAX_QUERY_LENGTH) : "";
}

function coerceFolderId(value: string): string {
  return typeof value === "string" && value.length > 0 ? value : ROOT_FOLDER;
}

/** The picker's open state: the user's most-recently-modified files. */
export async function listRecentDriveFilesAction(): Promise<
  DriveListResult<DriveItem[]>
> {
  const user = await requireAuthUser();
  return listRecentFiles(user.id);
}

/** Global search across the user's Drive by file name. */
export async function searchDriveFilesAction(
  query: string,
): Promise<DriveListResult<DriveItem[]>> {
  const user = await requireAuthUser();
  return searchFiles(user.id, coerceQuery(query));
}

/** Direct children of a folder (subfolders first, then files); 'root' = My Drive. */
export async function listDriveFolderAction(
  folderId: string,
): Promise<DriveListResult<DriveItem[]>> {
  const user = await requireAuthUser();
  return listFolderContents(user.id, coerceFolderId(folderId));
}

/** Ancestor chain for the breadcrumb, ordered My Drive → folder. */
export async function getDriveFolderPathAction(
  folderId: string,
): Promise<DriveListResult<DriveCrumb[]>> {
  const user = await requireAuthUser();
  return getFolderPath(user.id, coerceFolderId(folderId));
}
