import type { CollectionPreparationState } from "@/lib/knowledge/extraction/extract";
import type { QueryableAttribute } from "@/lib/knowledge/structured-query-shared";

/**
 * Document KINDS (Structured Query folders rework, Step 3b). A "kind" is a
 * document type defined once as a schema and shared across the folders that hold
 * that type (the 3a per-set foundation: `collections.schema_id` points many
 * folders at one `collection_schemas` row). Structured Query asks over a KIND,
 * not a single folder: you pick folders, those folders resolve to the kind(s)
 * they share, and you ask the kind.
 *
 * This module is the PURE resolution layer — given a set of picked folders, it
 * groups them by the kind they belong to, so the surface can decide between
 * "ask" (one set-up, prepared kind), "which kind?" (the picks span several), and
 * "set it up" (a kind isn't defined or prepared yet). No I/O, no model, no clock:
 * client-safe and unit-tested, the same discipline as the deterministic engine.
 */

/** One folder as the Structured Query surface carries it: its identity and
 * counts, plus the kind it belongs to (its `schemaId`/`schemaName`), the kind's
 * fields, and its own preparation state. `schemaId === null` means the folder
 * has no kind assigned yet. */
export type QueryFolder = {
  id: string;
  name: string;
  /** Source provenance paths, always shown (the transparency rule). */
  provenance: string[];
  documentCount: number;
  lastSyncedAt: string | null;
  /** The kind this folder belongs to, or null when none is assigned. */
  schemaId: string | null;
  schemaName: string | null;
  /** The kind's tracked fields (empty when no kind is assigned). */
  attributes: QueryableAttribute[];
  preparationState: CollectionPreparationState;
};

/** A group of picked folders that share one kind (or, for `schemaId === null`,
 * the folders with no kind assigned yet). */
export type KindGroup = {
  /** The shared kind id, or null for the "not set up yet" group. */
  schemaId: string | null;
  /** The kind's name, or null for the unset group. */
  schemaName: string | null;
  folderIds: string[];
  folderNames: string[];
  documentCount: number;
  /** The kind's fields (identical across the group; empty for the unset group). */
  attributes: QueryableAttribute[];
  /** A kind with at least one defined field — askable once prepared. */
  hasSchema: boolean;
  /** At least one folder in the set has prepared data, so the kind can be asked
   * over (its answer may still carry a stale-data notice). */
  prepared: boolean;
};

/** The unset folders sort last; defined kinds sort by name then id, so the
 * surface lists them stably without depending on pick order. */
function compareGroups(a: KindGroup, b: KindGroup): number {
  if (a.schemaId === null) return b.schemaId === null ? 0 : 1;
  if (b.schemaId === null) return -1;
  const byName = (a.schemaName ?? "").localeCompare(b.schemaName ?? "");
  return byName !== 0 ? byName : a.schemaId.localeCompare(b.schemaId);
}

const PREPARED_STATES = new Set<CollectionPreparationState>([
  "ready",
  "needs_updating",
]);

/**
 * Group picked folders by the kind they share. Folders with no kind assigned
 * collapse into a single `schemaId: null` group (the "set it up" bucket). A
 * group is `hasSchema` when the kind defines at least one field, and `prepared`
 * when at least one of its folders has prepared data. Pure and order-stable.
 */
export function groupFoldersByKind(folders: QueryFolder[]): KindGroup[] {
  const byKind = new Map<string, KindGroup>();
  for (const folder of folders) {
    const groupKey = folder.schemaId ?? "__unset__";
    let group = byKind.get(groupKey);
    if (!group) {
      group = {
        schemaId: folder.schemaId,
        schemaName: folder.schemaName,
        folderIds: [],
        folderNames: [],
        documentCount: 0,
        attributes: [],
        hasSchema: false,
        prepared: false,
      };
      byKind.set(groupKey, group);
    }
    group.folderIds.push(folder.id);
    group.folderNames.push(folder.name);
    group.documentCount += folder.documentCount;
    // The kind's fields are identical across the group; adopt the first
    // non-empty set we encounter (and the name that came with it).
    if (group.attributes.length === 0 && folder.attributes.length > 0) {
      group.attributes = folder.attributes;
      if (folder.schemaName) group.schemaName = folder.schemaName;
    }
    if (PREPARED_STATES.has(folder.preparationState)) group.prepared = true;
  }
  const groups = [...byKind.values()];
  for (const group of groups) {
    group.hasSchema = group.schemaId !== null && group.attributes.length > 0;
  }
  return groups.sort(compareGroups);
}

/**
 * Reduce a set of folders' preparation states into the single state that should
 * govern a kind-wide answer's stale-data notice. The most cautionary truthful
 * state wins: any folder needing an update makes the whole answer "needs
 * updating"; otherwise any ready folder makes it "ready"; failing that the most
 * informative not-yet-prepared state surfaces. Pure.
 */
export function aggregatePreparationState(
  states: CollectionPreparationState[],
): CollectionPreparationState {
  if (states.length === 0) return "no_schema";
  if (states.includes("needs_updating")) return "needs_updating";
  if (states.includes("ready")) return "ready";
  if (states.includes("not_prepared")) return "not_prepared";
  if (states.includes("no_documents")) return "no_documents";
  return "no_schema";
}
