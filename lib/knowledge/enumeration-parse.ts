/**
 * Pure parsers for the repository-enumeration tool results (Knowledge arc
 * Step 1). The MCP SDK returns a tool result as content blocks (and
 * sometimes `structuredContent`); these functions normalize a server's
 * payload into the adapter-neutral RemoteEntry/RemotePage shapes, reading
 * every field defensively — a missing or oddly-typed field degrades to
 * null, never a throw, except for a payload with no recognizable listing at
 * all (the caller surfaces that as an honest "couldn't read this folder").
 *
 * Pure (struct in, struct out) and unit-tested; the network lives in
 * enumeration.ts.
 */

/** One entry in a remote folder listing. */
export type RemoteEntry = {
  /** The repository's stable id. */
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  /** ISO timestamp of the last modification, when the server reports one. */
  modifiedAt: string | null;
  /** A human-facing link to the document, when the server reports one. */
  url: string | null;
};

/** One page of a folder listing. */
export type RemotePage = {
  entries: RemoteEntry[];
  /** Opaque continuation token; null = no more pages. */
  nextPageToken: string | null;
};

/** A folder's identity for display-path recompute. */
export type RemoteFolderInfo = {
  name: string;
  /** The parent folder id, or null at (or above) the root. */
  parentId: string | null;
};

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Unwrap an MCP CallToolResult into its JSON payload: prefer
 * `structuredContent`, else parse the first text content block as JSON.
 * Returns null when neither yields an object.
 */
export function toolResultJson(result: unknown): unknown {
  if (typeof result !== "object" || result === null) return null;
  const r = result as { structuredContent?: unknown; content?: unknown };
  if (typeof r.structuredContent === "object" && r.structuredContent !== null) {
    return r.structuredContent;
  }
  if (Array.isArray(r.content)) {
    for (const block of r.content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        try {
          return JSON.parse((block as { text: string }).text);
        } catch {
          return null;
        }
      }
    }
  }
  // Some servers return the bare JSON object as the result itself.
  return result;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

/** Parse one page of Drive's `search_files` result (the verified-live shape:
 * `{ files: [{ id, title, mimeType, modifiedTime, viewUrl, ... }], nextPageToken? }`). */
export function parseDrivePage(result: unknown): RemotePage {
  const json = toolResultJson(result);
  if (typeof json !== "object" || json === null) {
    throw new Error("unrecognized listing payload");
  }
  const files = (json as { files?: unknown }).files;
  if (!Array.isArray(files)) {
    throw new Error("unrecognized listing payload");
  }
  const entries: RemoteEntry[] = [];
  for (const raw of files) {
    if (typeof raw !== "object" || raw === null) continue;
    const file = raw as Record<string, unknown>;
    const id = asString(file.id);
    if (!id) continue;
    const mimeType = asString(file.mimeType);
    entries.push({
      id,
      name: asString(file.title) ?? asString(file.name) ?? id,
      isFolder: mimeType === DRIVE_FOLDER_MIME,
      mimeType,
      sizeBytes: asNumber(file.sizeBytes) ?? asNumber(file.size),
      modifiedAt: asString(file.modifiedTime),
      url: asString(file.viewUrl),
    });
  }
  return {
    entries,
    nextPageToken: asString((json as Record<string, unknown>).nextPageToken),
  };
}

/** Parse Drive's `get_file_metadata` result into folder info. */
export function parseDriveFolderInfo(result: unknown): RemoteFolderInfo | null {
  const json = toolResultJson(result);
  if (typeof json !== "object" || json === null) return null;
  // Some servers wrap the entity (e.g. { file: {...} }); accept both.
  const wrapped = (json as { file?: unknown }).file;
  const entity = (
    typeof wrapped === "object" && wrapped !== null ? wrapped : json
  ) as Record<string, unknown>;
  const name = asString(entity.title) ?? asString(entity.name);
  if (!name) return null;
  return { name, parentId: asString(entity.parentId) };
}

/**
 * Parse one page of Box's `list_folder_content_by_folder_id` result. Written
 * to Box's documented shape (`{ entries: [{ id, name, type, size, ... }],
 * total_count? }`) and read defensively — Box is verified at first live
 * enablement. Offset-based pagination: the next token is the next offset
 * while a full page came back (or total_count says there is more).
 */
export function parseBoxPage(
  result: unknown,
  offset: number,
  pageSize: number,
): RemotePage {
  const json = toolResultJson(result);
  if (typeof json !== "object" || json === null) {
    throw new Error("unrecognized listing payload");
  }
  const record = json as Record<string, unknown>;
  const list = Array.isArray(record.entries)
    ? record.entries
    : Array.isArray(record.items)
      ? record.items
      : null;
  if (!list) {
    throw new Error("unrecognized listing payload");
  }
  const entries: RemoteEntry[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const id = asString(item.id) ?? asNumber(item.id)?.toString() ?? null;
    const name = asString(item.name);
    if (!id || !name) continue;
    const type = asString(item.type);
    if (type === "web_link") continue; // links are not documents
    entries.push({
      id,
      name,
      isFolder: type === "folder",
      mimeType: asString(item.content_type) ?? null,
      sizeBytes: asNumber(item.size),
      modifiedAt: asString(item.modified_at) ?? asString(item.content_modified_at),
      url: asString(item.shared_link) ?? null,
    });
  }
  const totalCount = asNumber(record.total_count);
  const hasMore =
    totalCount !== null ? offset + list.length < totalCount : list.length === pageSize;
  return {
    entries,
    nextPageToken: hasMore ? String(offset + list.length) : null,
  };
}

/** Parse Box folder details into folder info (defensive; null on surprise). */
export function parseBoxFolderInfo(result: unknown): RemoteFolderInfo | null {
  const json = toolResultJson(result);
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;
  const name = asString(record.name);
  if (!name) return null;
  const parent = record.parent;
  const parentId =
    typeof parent === "object" && parent !== null
      ? asString((parent as Record<string, unknown>).id)
      : null;
  return { name, parentId };
}
