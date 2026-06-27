import type { SyncCursor } from "@/lib/knowledge/sync";

/**
 * Shared shapes for the Collections server actions (Knowledge arc Step 1).
 * Lives OUTSIDE the "use server" module on purpose: a "use server" file must
 * export only async functions (D-072 — re-exported types become runtime
 * references and throw on action dispatch), so the client components and the
 * actions both import these from here.
 */

/** What the admin saves for a collection. */
export type CollectionInput = {
  id?: string;
  name: string;
  description: string;
  visibility: "org" | "departments";
  /** Department ids; meaningful only when visibility is 'departments'. */
  departmentIds: string[];
};

/** One entry of a browsed remote folder, as the picker renders it. */
export type BrowseEntry = {
  id: string;
  name: string;
  isFolder: boolean;
};

/** One page of the folder browser. */
export type BrowsePage = {
  entries: BrowseEntry[];
  nextPageToken: string | null;
  /** Documents (non-folders) on this page, for the scope-size preview. */
  documentCount: number;
  folderCount: number;
};

export type BrowseResult =
  | { ok: true; page: BrowsePage }
  | { ok: false; error: string };

/** What the admin saves for a source, captured from the picker. */
export type SourceInput = {
  collectionId: string;
  connectionId: string;
  rootReference: string;
  /** The picker's breadcrumb names, root-first (server name prepended server-side). */
  pathNames: string[];
  recursive: boolean;
};

/**
 * One folder a user picked, decoupled from any collection (Step 2). The shared
 * folder picker returns a list of these; each caller decides what to do with
 * them (Research find-or-creates an invisible folder-backed collection per
 * descriptor). `displayName` is the folder's own name, for in-UI display before
 * the server resolves the full provenance path.
 */
export type FolderDescriptor = {
  connectionId: string;
  rootReference: string;
  /** Breadcrumb names, root-first (server name is prepended server-side). */
  pathNames: string[];
  recursive: boolean;
  displayName: string;
};

/** One sync invocation's outcome. The client loops while `completed` is false. */
export type SyncProgress = {
  completed: boolean;
  /** Feed back to continue when not completed. */
  cursor: SyncCursor | null;
  /** The source-id snapshot the cursor is valid against; echo it back. */
  sourceIds: string[] | null;
  documentsSeen: number;
  foldersWalked: number;
  /** Sources skipped because their connection wasn't usable (display paths). */
  skippedSources: string[];
};

export type SyncResult =
  | ({ ok: true } & SyncProgress)
  | { ok: false; error: string };

export type CollectionActionResult =
  | { ok: true; collectionId?: string }
  | { ok: false; error: string };
