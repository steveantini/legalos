/**
 * Pure pieces of folder-backed (auto) collections (Step 2): the idempotency
 * decision and the synthesized name. No I/O — the server action injects the real
 * find/create around the core, so "same folder twice returns one collection" is
 * unit-tested with fakes, exactly like the extraction segment core. The DB
 * partial-unique index (migration 20260627100000) is the concurrency backstop
 * the impure layer falls back on; the core captures the single-caller contract.
 */

export type FolderKey = {
  connectionId: string;
  rootReference: string;
};

/**
 * Find-or-create, deterministically: reuse an existing auto-folder collection
 * for this exact folder, otherwise create one. Idempotent by construction at the
 * logic level: calling it twice for the same folder, with a `findExisting` that
 * reflects prior creates, returns the same id and creates at most once.
 */
export async function ensureFolderCollectionCore(
  key: FolderKey,
  deps: {
    findExisting: (key: FolderKey) => Promise<string | null>;
    create: (key: FolderKey) => Promise<string>;
  },
): Promise<string> {
  const existing = await deps.findExisting(key);
  if (existing) return existing;
  return deps.create(key);
}

/**
 * The display name for an auto-folder collection: the folder's own name (the
 * last breadcrumb segment), falling back to the server name, then a constant, so
 * the NOT-NULL `collections.name` is always safely synthesizable from a pick.
 * Capped to the column-friendly length.
 */
export function synthesizeFolderName(pathNames: string[], serverName: string): string {
  const last = pathNames.length > 0 ? pathNames[pathNames.length - 1]?.trim() : "";
  const name = last || serverName.trim() || "Folder";
  return name.slice(0, 80);
}
