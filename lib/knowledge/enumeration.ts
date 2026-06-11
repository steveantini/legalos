import "server-only";

import { callMcpServerTool } from "@/lib/connections/mcp/client";
import {
  parseBoxFolderInfo,
  parseBoxPage,
  parseDriveFolderInfo,
  parseDrivePage,
  toolResultText,
  type RemoteEntry,
  type RemoteFolderInfo,
  type RemotePage,
} from "@/lib/knowledge/enumeration-parse";

/**
 * Repository enumeration over the org's MCP connections (Knowledge arc Step
 * 1) — the per-connector adapters the folder picker and the inventory sync
 * walk through. READ-ONLY by construction: every tool this module calls
 * lists folders or reads metadata; nothing here touches document content or
 * writes to a repository.
 *
 * An adapter exists only for servers whose enumeration surface has been
 * characterized (the catalog's `canEnumerate` records the vetted capability;
 * this registry is the implementation): Google Drive, verified live
 * (search_files with paginated `parentId` queries over stable immutable
 * ids), and Box, written to its documented surface
 * (`list_folder_content_by_folder_id`) and verified at first live
 * enablement. A connected server with no adapter simply cannot back a
 * collection source yet.
 *
 * Parsing lives in enumeration-parse.ts (pure, unit-tested); this module
 * owns the tool calls and the per-server tool/argument shapes.
 */

export type { RemoteEntry, RemoteFolderInfo, RemotePage };

/** What an adapter needs to call its server: endpoint + a live token. */
export type EnumerationTarget = {
  serverId: string;
  serverUrl: string;
  accessToken: string;
};

/** Drive/Box ids are URL-safe tokens; reject anything else before it ever
 * reaches a query string (Drive ids interpolate into the search query). */
const SAFE_REMOTE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeRemoteId(id: string): boolean {
  return SAFE_REMOTE_ID.test(id);
}

/**
 * One document's extracted text, capped to the RESEARCH read budget. The
 * research engine reads through this — NOT through executeMcpTool, whose
 * ~25k-character result cap is sized for chat tool results and would gut a
 * contract (the design-check's reuse trap). `truncated` is honest: a capped
 * read becomes a 'read_incomplete' finding, never a silent partial.
 */
export type RemoteDocumentText = {
  text: string;
  truncated: boolean;
};

/** The research read budget per document (~15k tokens of contract text). */
export const RESEARCH_READ_CHAR_BUDGET = 60_000;

type EnumerationAdapter = {
  /** List one page of a folder's children. `folderId` null = the root. */
  listChildren(
    target: EnumerationTarget,
    folderId: string | null,
    pageToken: string | null,
  ): Promise<RemotePage>;
  /**
   * A folder's current name and parent, for recomputing display provenance
   * at sync. Null when the server offers no clean metadata lookup (the
   * cached display path is kept instead — honest, never invented).
   */
  getFolderInfo(
    target: EnumerationTarget,
    folderId: string,
  ): Promise<RemoteFolderInfo | null>;
  /** Read one document's extracted text (the research engine's read path). */
  readDocument(
    target: EnumerationTarget,
    documentId: string,
  ): Promise<RemoteDocumentText | null>;
};

/** Cap raw extracted text to the research budget, flagging the truncation. */
function capDocumentText(text: string): RemoteDocumentText {
  if (text.length <= RESEARCH_READ_CHAR_BUDGET) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, RESEARCH_READ_CHAR_BUDGET), truncated: true };
}

/** Page size for enumeration calls (Drive's search page ceiling). */
const PAGE_SIZE = 100;

const driveAdapter: EnumerationAdapter = {
  async listChildren(target, folderId, pageToken) {
    const parent = folderId ?? "root";
    if (parent !== "root" && !isSafeRemoteId(parent)) {
      throw new Error("invalid folder reference");
    }
    const result = await callMcpServerTool({
      serverUrl: target.serverUrl,
      accessToken: target.accessToken,
      toolName: "search_files",
      arguments: {
        // The verified-live enumeration shape: a structured Drive query by
        // parent, paginated. Stable immutable ids come back per entry.
        query: `parentId = '${parent}'`,
        pageSize: PAGE_SIZE,
        excludeContentSnippets: true,
        ...(pageToken ? { pageToken } : {}),
      },
    });
    return parseDrivePage(result);
  },

  async getFolderInfo(target, folderId) {
    if (!isSafeRemoteId(folderId)) return null;
    try {
      const result = await callMcpServerTool({
        serverUrl: target.serverUrl,
        accessToken: target.accessToken,
        toolName: "get_file_metadata",
        arguments: { fileId: folderId },
      });
      return parseDriveFolderInfo(result);
    } catch {
      return null;
    }
  },

  async readDocument(target, documentId) {
    if (!isSafeRemoteId(documentId)) return null;
    try {
      const result = await callMcpServerTool({
        serverUrl: target.serverUrl,
        accessToken: target.accessToken,
        toolName: "read_file_content",
        arguments: { fileId: documentId },
      });
      const text = toolResultText(result);
      return text ? capDocumentText(text) : null;
    } catch {
      return null;
    }
  },
};

const boxAdapter: EnumerationAdapter = {
  async listChildren(target, folderId, pageToken) {
    const folder = folderId ?? "0"; // Box's documented root id.
    if (!isSafeRemoteId(folder)) {
      throw new Error("invalid folder reference");
    }
    // Box paginates by offset; the page token carries it as a number string.
    const offset = pageToken ? Number.parseInt(pageToken, 10) : 0;
    const result = await callMcpServerTool({
      serverUrl: target.serverUrl,
      accessToken: target.accessToken,
      toolName: "list_folder_content_by_folder_id",
      arguments: {
        folder_id: folder,
        limit: PAGE_SIZE,
        ...(offset > 0 ? { offset } : {}),
      },
    });
    return parseBoxPage(result, offset, PAGE_SIZE);
  },

  async getFolderInfo(target, folderId) {
    if (!isSafeRemoteId(folderId)) return null;
    try {
      const result = await callMcpServerTool({
        serverUrl: target.serverUrl,
        accessToken: target.accessToken,
        toolName: "get_folder_details",
        arguments: { folder_id: folderId },
      });
      return parseBoxFolderInfo(result);
    } catch {
      // Box's metadata lookup is unverified until first live enablement; the
      // cached display path stands in when it isn't available.
      return null;
    }
  },

  async readDocument(target, documentId) {
    if (!isSafeRemoteId(documentId)) return null;
    try {
      const result = await callMcpServerTool({
        serverUrl: target.serverUrl,
        accessToken: target.accessToken,
        toolName: "get_file_content",
        arguments: { file_id: documentId },
      });
      const text = toolResultText(result);
      return text ? capDocumentText(text) : null;
    } catch {
      return null;
    }
  },
};

/** serverId → adapter. Both the catalog's `canEnumerate` AND an entry here
 * must hold for a server to back a collection source. */
const ADAPTERS: Record<string, EnumerationAdapter> = {
  "google-drive-mcp": driveAdapter,
  "box-mcp": boxAdapter,
};

/** Whether an enumeration adapter is implemented for this server. */
export function hasEnumerationAdapter(serverId: string): boolean {
  return serverId in ADAPTERS;
}

function adapterFor(serverId: string): EnumerationAdapter {
  const adapter = ADAPTERS[serverId];
  if (!adapter) throw new Error("no enumeration adapter for this server");
  return adapter;
}

/** List one page of a folder's children through the server's adapter. */
export async function listRemoteFolderChildren(
  target: EnumerationTarget,
  folderId: string | null,
  pageToken: string | null,
): Promise<RemotePage> {
  return adapterFor(target.serverId).listChildren(target, folderId, pageToken);
}

/** A folder's current name/parent for provenance recompute, or null. */
export async function getRemoteFolderInfo(
  target: EnumerationTarget,
  folderId: string,
): Promise<RemoteFolderInfo | null> {
  return adapterFor(target.serverId).getFolderInfo(target, folderId);
}

/** Read one document's extracted text through the server's adapter, capped
 * to the research budget. Null = the document could not be read at all. */
export async function readRemoteDocument(
  target: EnumerationTarget,
  documentId: string,
): Promise<RemoteDocumentText | null> {
  return adapterFor(target.serverId).readDocument(target, documentId);
}

/**
 * Recompute a source's display path by walking parents upward from the root
 * folder (capped, defensive): "<Server display name> / Legal / Playbooks".
 * Returns null when the walk can't even resolve the folder itself, so the
 * caller keeps the previously cached path rather than overwriting good
 * provenance with nothing.
 */
export async function computeDisplayPath(
  target: EnumerationTarget,
  serverDisplayName: string,
  folderId: string,
): Promise<string | null> {
  const MAX_HOPS = 12;
  const names: string[] = [];
  let current: string | null = folderId;
  for (let hop = 0; hop < MAX_HOPS && current; hop += 1) {
    const info = await getRemoteFolderInfo(target, current);
    if (!info) break;
    names.unshift(info.name);
    current = info.parentId;
  }
  if (names.length === 0) return null;
  return [serverDisplayName, ...names].join(" / ");
}
