"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addCollectionSource,
  browseSourceFolder,
  deleteCollection,
  prepareCollection,
  removeCollectionSource,
  saveCollection,
  saveCollectionSchema,
  syncCollection,
} from "@/lib/actions/collections";
import {
  composePreparationBasis,
  type PreparationTally,
} from "@/lib/knowledge/extraction/extract";
import {
  COLLECTION_ATTRIBUTE_TYPES,
  makeUniqueAttributeKey,
  MAX_COLLECTION_ATTRIBUTES,
  slugifyAttributeKey,
  type CollectionAttribute,
  type CollectionAttributeType,
  type CollectionSchemaInput,
} from "@/lib/knowledge/collection-schema";
import type {
  BrowseEntry,
  CollectionInput,
  SourceInput,
} from "@/lib/knowledge/collections-shared";
import type {
  CollectionView as CollectionViewModel,
  CollectionSourceView,
  EligibleSourceConnection,
} from "@/lib/knowledge/collections-data";
import type { SyncCursor } from "@/lib/knowledge/sync";
import { cn } from "@/lib/utils";

/**
 * The Collections surface (Knowledge arc Step 1). One component, two
 * postures: super admins manage (create, edit, delete, add sources through
 * the live folder browser, sync); everyone else reads the same cards.
 *
 * The transparency rule is structural: a collection card always renders its
 * real sources ("Google Drive / Legal / Playbooks"), a source whose
 * connection isn't usable renders honestly disabled, and the inventory line
 * states counts and sync age plainly. The sync runs as a client-driven loop
 * over the segmented server action, so arbitrarily large trees never pin a
 * request; progress is reported as it goes.
 */

/** "2h ago" style relative formatter (local idiom, like conversation-card). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type FormState =
  | { mode: "create" }
  | { mode: "edit"; collection: CollectionViewModel };

export function CollectionsView({
  collections,
  departments,
  eligibleConnections,
  canEdit,
  initialSchemaCollectionId,
}: {
  collections: CollectionViewModel[];
  departments: { id: string; name: string }[];
  eligibleConnections: EligibleSourceConnection[];
  canEdit: boolean;
  /** When set (the `?schema=<id>` deep-link from Structured Query), open the
   * define-schema dialog for that collection on first render. */
  initialSchemaCollectionId?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Lazy initializer (not an effect) so the deep-link opens the schema dialog on
  // mount with no cascading-render setState-in-effect.
  const [schemaFor, setSchemaFor] = useState<CollectionViewModel | null>(() =>
    canEdit && initialSchemaCollectionId
      ? collections.find((c) => c.id === initialSchemaCollectionId) ?? null
      : null,
  );
  const [deleteTarget, setDeleteTarget] =
    useState<CollectionViewModel | null>(null);
  const [pendingDelete, startDelete] = useTransition();
  // The save and add-source mutations run in THIS component's transitions,
  // not the dialogs': closing a dialog unmounts it, and a router.refresh()
  // scheduled inside an unmounting component's transition is dropped with it
  // (the bug where a created collection appeared only after a manual reload).
  // CollectionsView stays mounted, so its refresh always lands — the same
  // reason the People invite flow works (its component survives its dialog).
  const [pendingSave, startSave] = useTransition();
  const [pendingAddSource, startAddSource] = useTransition();
  const [pendingSchema, startSchema] = useTransition();
  // Per-collection sync progress; presence = running.
  const [syncProgress, setSyncProgress] = useState<
    Record<string, { documents: number }>
  >({});
  // Per-collection preparation progress; presence = running. `verb` follows the
  // state (Prepare on first run, Update after).
  const [prepProgress, setPrepProgress] = useState<
    Record<string, { prepared: number; total: number; verb: "Prepare" | "Update" }>
  >({});

  const canAddSources = eligibleConnections.length > 0;

  function handleSaveCollection(input: CollectionInput) {
    if (pendingSave) return;
    startSave(async () => {
      const result = await saveCollection(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(input.id ? "Collection saved." : "Collection created.");
      router.refresh();
      setForm(null);
    });
  }

  function handleSaveSchema(input: CollectionSchemaInput) {
    if (pendingSchema) return;
    startSchema(async () => {
      const result = await saveCollectionSchema(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Schema saved.");
      router.refresh();
      setSchemaFor(null);
    });
  }

  function handleAddSource(input: SourceInput) {
    if (pendingAddSource) return;
    startAddSource(async () => {
      const result = await addCollectionSource(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Source added. Run sync to build the inventory.");
      router.refresh();
      setPickerFor(null);
    });
  }

  async function runSync(collectionId: string) {
    if (syncProgress[collectionId]) return;
    setSyncProgress((prev) => ({ ...prev, [collectionId]: { documents: 0 } }));
    let cursor: SyncCursor | null = null;
    let sourceIds: string[] | null = null;
    // A generous segment ceiling as a runaway backstop (30 listings each).
    const MAX_SEGMENTS = 60;
    try {
      for (let segment = 0; segment < MAX_SEGMENTS; segment += 1) {
        const result = await syncCollection({ collectionId, cursor, sourceIds });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setSyncProgress((prev) => ({
          ...prev,
          [collectionId]: { documents: result.documentsSeen },
        }));
        if (result.completed) {
          const docs = result.documentsSeen;
          toast.success(
            docs === 1 ? "Synced: 1 document." : `Synced: ${docs} documents.`,
          );
          if (result.skippedSources.length > 0) {
            toast.error(
              `${result.skippedSources.length} ${
                result.skippedSources.length === 1 ? "source" : "sources"
              } couldn't be read and ${
                result.skippedSources.length === 1 ? "was" : "were"
              } skipped.`,
            );
          }
          router.refresh();
          return;
        }
        cursor = result.cursor;
        sourceIds = result.sourceIds;
      }
      toast.error(
        "This sync is unusually large and paused for now. Run sync again to continue.",
      );
      router.refresh();
    } finally {
      setSyncProgress((prev) => {
        const next = { ...prev };
        delete next[collectionId];
        return next;
      });
    }
  }

  async function runPrepare(
    collectionId: string,
    verb: "Prepare" | "Update",
  ) {
    if (prepProgress[collectionId]) return;
    setPrepProgress((prev) => ({
      ...prev,
      [collectionId]: { prepared: 0, total: 0, verb },
    }));
    let failedDocumentIds: string[] | null = null;
    let total = 0;
    const acc: PreparationTally = {
      documentsPrepared: 0,
      documentsUnreadable: 0,
      attributesFound: 0,
      attributesNotFound: 0,
      attributesUnverified: 0,
      attributesReadIncomplete: 0,
    };
    // A generous backstop (segments of 4 documents each), matching runSync.
    const MAX_SEGMENTS = 400;
    try {
      for (let segment = 0; segment < MAX_SEGMENTS; segment += 1) {
        const result = await prepareCollection({ collectionId, failedDocumentIds });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        if (segment === 0) total = result.documentsStale;
        acc.documentsPrepared += result.tally.documentsPrepared;
        acc.documentsUnreadable += result.tally.documentsUnreadable;
        acc.attributesFound += result.tally.attributesFound;
        acc.attributesNotFound += result.tally.attributesNotFound;
        acc.attributesUnverified += result.tally.attributesUnverified;
        acc.attributesReadIncomplete += result.tally.attributesReadIncomplete;
        failedDocumentIds = result.failedDocumentIds;
        setPrepProgress((prev) => ({
          ...prev,
          [collectionId]: {
            prepared: acc.documentsPrepared + acc.documentsUnreadable,
            total,
            verb,
          },
        }));
        if (result.completed) {
          toast.success(
            total === 0
              ? "Already up to date."
              : composePreparationBasis(acc, total),
          );
          router.refresh();
          return;
        }
      }
      toast.error(
        "Preparation is taking unusually long and paused for now. Run Update to continue.",
      );
      router.refresh();
    } finally {
      setPrepProgress((prev) => {
        const next = { ...prev };
        delete next[collectionId];
        return next;
      });
    }
  }

  function handleDelete(collection: CollectionViewModel) {
    if (pendingDelete) return;
    startDelete(async () => {
      const result = await deleteCollection(collection.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDeleteTarget(null);
      toast.success("Collection deleted.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={() => setForm({ mode: "create" })}>
            New collection
          </Button>
          {!canAddSources ? (
            <p className="text-[12.5px] leading-[1.5] text-caption">
              Connect a repository like Google Drive or Box in Policy &amp;
              access to give collections something to draw from.
            </p>
          ) : null}
        </div>
      ) : null}

      {collections.length === 0 ? (
        <p className="max-w-[60ch] rounded-lg bg-paper-2 px-5 py-4 text-[13.5px] leading-[1.5] text-muted-foreground">
          {canEdit
            ? "No collections yet. Create one to draw a named scope over a connected repository, like a contracts folder in Google Drive."
            : "No collections are visible to you yet. Your administrators create them over the repositories your team uses."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              canEdit={canEdit}
              canAddSources={canAddSources}
              syncing={syncProgress[collection.id] ?? null}
              preparing={prepProgress[collection.id] ?? null}
              onSync={() => runSync(collection.id)}
              onPrepare={(verb) => runPrepare(collection.id, verb)}
              onEdit={() => setForm({ mode: "edit", collection })}
              onDelete={() => setDeleteTarget(collection)}
              onAddSource={() => setPickerFor(collection.id)}
              onDefineSchema={() => setSchemaFor(collection)}
            />
          ))}
        </div>
      )}

      {form ? (
        <CollectionFormDialog
          state={form}
          departments={departments}
          pending={pendingSave}
          onClose={() => setForm(null)}
          onSubmit={handleSaveCollection}
        />
      ) : null}

      {pickerFor ? (
        <SourcePickerDialog
          collectionId={pickerFor}
          connections={eligibleConnections}
          pending={pendingAddSource}
          onClose={() => setPickerFor(null)}
          onSubmit={handleAddSource}
        />
      ) : null}

      {schemaFor ? (
        <SchemaBuilderDialog
          collection={schemaFor}
          pending={pendingSchema}
          onClose={() => setSchemaFor(null)}
          onSubmit={handleSaveSchema}
        />
      ) : null}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget ? `“${deleteTarget.name}”` : "this collection"}?
            </DialogTitle>
            <DialogDescription>
              The collection and its document inventory are removed. The
              documents themselves live in your repositories and are not
              touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={pendingDelete}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={pendingDelete}
            >
              {pendingDelete ? "Deleting…" : "Delete collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One collection card
// ---------------------------------------------------------------------------

function visibilityLine(collection: CollectionViewModel): string {
  if (collection.visibility === "org") return "Visible to everyone";
  if (collection.departmentNames.length === 0) return "Visible to departments";
  return `Visible to ${collection.departmentNames.join(", ")}`;
}

function schemaLine(collection: CollectionViewModel): string {
  const n = collection.schemaAttributes.length;
  if (n === 0) return "No attributes defined";
  return n === 1 ? "1 attribute defined" : `${n} attributes defined`;
}

/** The verb the Prepare/Update action shows: first run prepares, later runs
 * update. (Internally this is extraction; the user-facing word is Prepare/Update.) */
function preparationVerb(
  state: CollectionViewModel["preparationState"],
): "Prepare" | "Update" {
  return state === "not_prepared" ? "Prepare" : "Update";
}

/** The plain-language preparation status shown under the schema line (admins). */
function preparationLine(
  state: CollectionViewModel["preparationState"],
): string | null {
  switch (state) {
    case "no_documents":
      return "Sync documents, then prepare their structured data";
    case "not_prepared":
      return "Structured data not prepared";
    case "needs_updating":
      return "Structured data needs updating";
    case "ready":
      return "Structured data ready";
    case "no_schema":
    default:
      return null;
  }
}

function inventoryLine(collection: CollectionViewModel): string {
  const parts: string[] = [];
  const n = collection.presentCount;
  parts.push(n === 1 ? "1 document" : `${n} documents`);
  if (collection.missingCount > 0) {
    parts.push(`${collection.missingCount} missing upstream`);
  }
  parts.push(
    collection.lastSyncedAt
      ? `synced ${relativeTime(collection.lastSyncedAt)}`
      : "not synced yet",
  );
  return parts.join(" · ");
}

function CollectionCard({
  collection,
  canEdit,
  canAddSources,
  syncing,
  preparing,
  onSync,
  onPrepare,
  onEdit,
  onDelete,
  onAddSource,
  onDefineSchema,
}: {
  collection: CollectionViewModel;
  canEdit: boolean;
  canAddSources: boolean;
  syncing: { documents: number } | null;
  preparing: { prepared: number; total: number; verb: "Prepare" | "Update" } | null;
  onSync: () => void;
  onPrepare: (verb: "Prepare" | "Update") => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddSource: () => void;
  onDefineSchema: () => void;
}) {
  const hasUsableSource = collection.sources.some(
    (source) => source.connectionStatus === "active",
  );
  const prepState = collection.preparationState;
  const prepVerb = preparationVerb(prepState);
  const prepStatus = preparationLine(prepState);
  // Prepare/Update is offered only once a schema and documents exist, and the
  // collection has work to do (not_prepared or needs_updating). A "ready"
  // collection shows its status without an idle button.
  const canPrepare =
    prepState === "not_prepared" || prepState === "needs_updating";

  return (
    <section
      aria-label={collection.name}
      className="rounded-xl border border-hairline bg-paper-2 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-medium tracking-[-0.005em] text-foreground">
              {collection.name}
            </h2>
            <span className="rounded-full border border-hairline bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {visibilityLine(collection)}
            </span>
          </div>
          {collection.description ? (
            <p className="mt-1 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
              {collection.description}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      {/* Sources: the transparency rule. Always the real provenance. */}
      <div className="mt-4">
        {collection.sources.length === 0 ? (
          <p className="text-[13px] leading-[1.5] text-caption">
            No sources yet.{" "}
            {canEdit ? "Add a folder from a connected repository." : ""}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {collection.sources.map((source) => (
              <SourceRow key={source.id} source={source} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[12.5px] text-muted-foreground">
            {syncing
              ? syncing.documents > 0
                ? `Syncing… ${syncing.documents} documents so far.`
                : "Syncing…"
              : inventoryLine(collection)}
          </p>
          {canEdit ? (
            <p className="text-[12px] text-caption">
              {schemaLine(collection)}
              {prepStatus ? (
                <>
                  {" · "}
                  {preparing
                    ? `${preparing.verb === "Prepare" ? "Preparing" : "Updating"}…${
                        preparing.total > 0
                          ? ` ${preparing.prepared} of ${preparing.total}`
                          : ""
                      }`
                    : prepStatus}
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDefineSchema}
              title="Define the attributes to extract from this collection's documents"
            >
              Define schema
            </Button>
            {canAddSources ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddSource}
              >
                Add source
              </Button>
            ) : null}
            {collection.sources.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSync}
                disabled={syncing !== null || preparing !== null || !hasUsableSource}
                title={
                  hasUsableSource
                    ? "Refresh the document inventory from the repositories"
                    : "No usable source connections right now"
                }
              >
                {syncing ? "Syncing…" : "Sync"}
              </Button>
            ) : null}
            {canPrepare ? (
              <Button
                type="button"
                size="sm"
                onClick={() => onPrepare(prepVerb)}
                disabled={preparing !== null || syncing !== null || !hasUsableSource}
                title={
                  hasUsableSource
                    ? "Read the documents and extract the defined attributes with cited evidence"
                    : "No usable source connections right now"
                }
              >
                {preparing
                  ? preparing.verb === "Prepare"
                    ? "Preparing…"
                    : "Updating…"
                  : prepVerb}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SourceRow({
  source,
  canEdit,
}: {
  source: CollectionSourceView;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const usable = source.connectionStatus === "active";

  function handleRemove() {
    if (pending) return;
    startTransition(async () => {
      const result = await removeCollectionSource(source.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Source removed.");
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          usable ? "bg-foreground" : "bg-muted-foreground/40",
        )}
      />
      <span
        className={cn(
          "min-w-0 break-all font-mono text-[12px]",
          usable ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {source.displayPath}
      </span>
      {!source.recursive ? (
        <span className="shrink-0 text-[11.5px] text-caption">
          this folder only
        </span>
      ) : null}
      {!usable ? (
        <span className="shrink-0 text-[11.5px] text-warn-fg">
          {source.connectionStatus === "error"
            ? "Connection needs reconnect"
            : "Connection unavailable"}
        </span>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          onClick={handleRemove}
          disabled={pending}
          className="ml-auto shrink-0 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 motion-reduce:transition-none"
        >
          Remove
        </button>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------

/**
 * Collects the collection's fields and hands them UP — the mutation and the
 * refresh run in the parent's transition (see CollectionsView), because this
 * dialog unmounts on success and an unmounting component's transition drops
 * its scheduled router.refresh().
 */
function CollectionFormDialog({
  state,
  departments,
  pending,
  onClose,
  onSubmit,
}: {
  state: FormState;
  departments: { id: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: CollectionInput) => void;
}) {
  const editing = state.mode === "edit" ? state.collection : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [visibility, setVisibility] = useState<"org" | "departments">(
    editing?.visibility ?? "org",
  );
  const [departmentIds, setDepartmentIds] = useState<string[]>(
    editing?.departmentIds ?? [],
  );

  function toggleDepartment(id: string) {
    setDepartmentIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  function handleSave() {
    if (pending) return;
    onSubmit({
      ...(editing ? { id: editing.id } : {}),
      name,
      description,
      visibility,
      departmentIds: visibility === "departments" ? departmentIds : [],
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit collection" : "New collection"}
          </DialogTitle>
          <DialogDescription>
            A named scope over your connected repositories. Sources are added
            after saving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="collection-name"
              className="text-[13px] font-medium text-foreground"
            >
              Name
            </label>
            <Input
              id="collection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Commercial contracts"
              className="mt-1.5 bg-paper-2"
              maxLength={120}
            />
          </div>

          <div>
            <label
              htmlFor="collection-description"
              className="text-[13px] font-medium text-foreground"
            >
              Description
            </label>
            <Textarea
              id="collection-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What belongs in this collection, in a sentence."
              className="mt-1.5 bg-paper-2"
              rows={2}
              maxLength={600}
            />
          </div>

          <fieldset>
            <legend className="text-[13px] font-medium text-foreground">
              Who can see it
            </legend>
            <div className="mt-1.5 flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="radio"
                  name="collection-visibility"
                  className="accent-primary"
                  checked={visibility === "org"}
                  onChange={() => setVisibility("org")}
                />
                Everyone in the organization
              </label>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="radio"
                  name="collection-visibility"
                  className="accent-primary"
                  checked={visibility === "departments"}
                  onChange={() => setVisibility("departments")}
                />
                Specific departments
              </label>
            </div>
            {visibility === "departments" ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {departments.map((department) => {
                  const selected = departmentIds.includes(department.id);
                  return (
                    <button
                      key={department.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleDepartment(department.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors duration-hover ease-soft motion-reduce:transition-none",
                        selected
                          ? "border-hairline-strong bg-secondary text-foreground"
                          : "border-hairline bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {department.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </fieldset>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || name.trim().length === 0}
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Create collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Source picker: live folder browser over the MCP enumeration
// ---------------------------------------------------------------------------

type Crumb = { id: string | null; name: string };

/**
 * Browses a repository and hands the chosen folder UP — the add-source
 * mutation and the refresh run in the parent's transition (see
 * CollectionsView), because this dialog unmounts on success and an
 * unmounting component's transition drops its scheduled router.refresh().
 */
function SourcePickerDialog({
  collectionId,
  connections,
  pending,
  onClose,
  onSubmit,
}: {
  collectionId: string;
  connections: EligibleSourceConnection[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: SourceInput) => void;
}) {
  // The repository is picked explicitly (even when only one qualifies): the
  // selection doubles as confirmation of which repository is being browsed,
  // and it keeps every fetch in an event handler — no load effect at all.
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "Top level" }]);
  // null = this folder hasn't loaded yet (the skeleton state); the listing is
  // reset to null in the NAVIGATION handlers, and every state write in
  // loadPage happens after the await, so the load effect performs no
  // synchronous setState.
  const [entries, setEntries] = useState<BrowseEntry[] | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [recursive, setRecursive] = useState(true);

  const currentFolder = crumbs[crumbs.length - 1];
  const connection = connections.find((c) => c.connectionId === connectionId);

  async function loadPage(
    targetConnectionId: string,
    folderId: string | null,
    pageToken: string | null,
    append: boolean,
  ) {
    const result = await browseSourceFolder({
      connectionId: targetConnectionId,
      folderId,
      pageToken,
    });
    if (!result.ok) {
      setBrowseError(result.error);
      if (!append) setEntries([]);
      return;
    }
    setBrowseError(null);
    setEntries((prev) =>
      append ? [...(prev ?? []), ...result.page.entries] : result.page.entries,
    );
    setNextPageToken(result.page.nextPageToken);
  }

  function clearListing() {
    setEntries(null);
    setNextPageToken(null);
    setBrowseError(null);
  }

  async function showMore() {
    if (!connection || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(connection.connectionId, currentFolder.id, nextPageToken, true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Every fetch starts from an event handler (select, descend, breadcrumb
  // jump) — there is no load effect, so nothing can set state from one.
  function selectConnection(id: string) {
    clearListing();
    setCrumbs([{ id: null, name: "Top level" }]);
    setConnectionId(id);
    void loadPage(id, null, null, false);
  }

  function descend(entry: BrowseEntry) {
    if (!connectionId) return;
    clearListing();
    setCrumbs((prev) => [...prev, { id: entry.id, name: entry.name }]);
    void loadPage(connectionId, entry.id, null, false);
  }

  function jumpTo(index: number) {
    if (!connectionId) return;
    const target = crumbs[index];
    clearListing();
    setCrumbs((prev) => prev.slice(0, index + 1));
    void loadPage(connectionId, target.id, null, false);
  }

  function handleAdd() {
    if (!connectionId || !currentFolder.id || pending) return;
    onSubmit({
      collectionId,
      connectionId,
      rootReference: currentFolder.id,
      pathNames: crumbs.slice(1).map((crumb) => crumb.name),
      recursive,
    });
  }

  const folderCount = (entries ?? []).filter((entry) => entry.isFolder).length;
  const documentCount = (entries ?? []).length - folderCount;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add a source</DialogTitle>
          <DialogDescription>
            Browse a connected repository and pick the folder this collection
            draws from. The folder is referenced by its stable id, so renames
            and moves don&rsquo;t break it.
          </DialogDescription>
        </DialogHeader>

        {!connection ? (
          <div className="flex flex-col gap-2">
            {connections.map((candidate) => (
              <button
                key={candidate.connectionId}
                type="button"
                onClick={() => selectConnection(candidate.connectionId)}
                className="flex items-center rounded-lg border border-hairline bg-paper-2 px-4 py-3 text-left text-[13.5px] font-medium text-foreground transition-colors duration-hover ease-soft hover:bg-secondary motion-reduce:transition-none"
              >
                {candidate.displayName}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Breadcrumb: server name, then the path walked. */}
            <p className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {connection.displayName}
              </span>
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.id ?? "root"}-${index}`} className="flex items-center gap-1">
                  <span aria-hidden="true">/</span>
                  {index < crumbs.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => jumpTo(index)}
                      className="rounded font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {crumb.name}
                    </button>
                  ) : (
                    <span className="font-medium text-foreground">{crumb.name}</span>
                  )}
                </span>
              ))}
            </p>

            <div className="max-h-[260px] overflow-y-auto rounded-lg border border-hairline bg-background">
              {entries === null && !browseError ? (
                // Network-backed loading standard: chrome + skeletons
                // immediately, content cross-fades into the same layout.
                <ul aria-hidden="true" className="flex flex-col">
                  {[0, 1, 2, 3, 4].map((row) => (
                    <li key={row} className="border-b border-hairline px-4 py-2.5 last:border-b-0">
                      <span className="block h-[14px] w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                    </li>
                  ))}
                </ul>
              ) : browseError ? (
                <p role="alert" className="px-4 py-3 text-[13px] leading-[1.5] text-warn-fg">
                  {browseError}
                </p>
              ) : entries === null || entries.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-muted-foreground">
                  This folder is empty.
                </p>
              ) : (
                <ul className="flex flex-col duration-200 animate-in fade-in-0 motion-reduce:animate-none">
                  {entries.map((entry) => (
                    <li key={entry.id} className="border-b border-hairline last:border-b-0">
                      {entry.isFolder ? (
                        <button
                          type="button"
                          onClick={() => descend(entry)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors duration-hover ease-soft hover:bg-paper-2 motion-reduce:transition-none"
                        >
                          <span className="min-w-0 truncate">{entry.name}</span>
                          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                            →
                          </span>
                        </button>
                      ) : (
                        <p className="truncate px-4 py-2.5 text-[13px] text-muted-foreground">
                          {entry.name}
                        </p>
                      )}
                    </li>
                  ))}
                  {nextPageToken ? (
                    <li className="px-4 py-2.5">
                      <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() => void showMore()}
                        className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 motion-reduce:transition-none"
                      >
                        {loadingMore ? "Loading…" : "Show more"}
                      </button>
                    </li>
                  ) : null}
                </ul>
              )}
            </div>

            {/* Honest scope preview for the level being looked at. */}
            {entries !== null ? (
              <p className="text-[12px] leading-[1.5] text-caption">
                On this level: {folderCount}{" "}
                {folderCount === 1 ? "folder" : "folders"}, {documentCount}{" "}
                {documentCount === 1 ? "document" : "documents"}
                {nextPageToken ? ", with more not yet shown" : ""}.
                {nextPageToken
                  ? " Large folders are fine; the sync walks them in pages."
                  : ""}
              </p>
            ) : null}

            <label className="flex items-center gap-2 text-[13px] text-foreground">
              <input
                type="checkbox"
                className="accent-primary"
                checked={recursive}
                onChange={(event) => setRecursive(event.target.checked)}
              />
              Include subfolders
            </label>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={pending || !connection || currentFolder.id === null}
            title={
              currentFolder.id === null
                ? "Open a folder first; the top level can't be a source"
                : undefined
            }
          >
            {pending ? "Adding…" : "Use this folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Schema builder: define the attributes to extract (Structured Query, commit 2)
// ---------------------------------------------------------------------------

const ATTRIBUTE_TYPE_LABEL: Record<CollectionAttributeType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / no",
  enum: "One of a set",
};

/** A draft attribute as the builder edits it; `key` is "" until first saved. */
type DraftAttribute = {
  clientId: string;
  key: string;
  label: string;
  type: CollectionAttributeType;
  description: string;
  /** Comma-separated options for an enum attribute; ignored otherwise. */
  optionsText: string;
};

/** Split the comma-separated options field into a clean, de-duplicated list. */
function parseOptionsText(text: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of text.split(",")) {
    const option = raw.trim();
    if (option && !seen.has(option)) {
      seen.add(option);
      options.push(option);
    }
  }
  return options;
}

function toDraft(attribute: CollectionAttribute): DraftAttribute {
  return {
    clientId: crypto.randomUUID(),
    key: attribute.key,
    label: attribute.label,
    type: attribute.type,
    description: attribute.description,
    optionsText: (attribute.options ?? []).join(", "),
  };
}

/**
 * Defines a collection's schema and hands the result UP — the mutation and the
 * refresh run in the parent's transition (see CollectionsView), because this
 * dialog unmounts on success and an unmounting component's transition drops its
 * scheduled router.refresh().
 *
 * Keys are STABLE: an attribute loaded with a key keeps it across label edits;
 * only brand-new attributes get a key derived from their label at save time.
 * This is what keeps commit 3's extracted values (keyed by attribute) from being
 * orphaned when an admin renames a label.
 */
function SchemaBuilderDialog({
  collection,
  pending,
  onClose,
  onSubmit,
}: {
  collection: CollectionViewModel;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: CollectionSchemaInput) => void;
}) {
  const [drafts, setDrafts] = useState<DraftAttribute[]>(() =>
    collection.schemaAttributes.map(toDraft),
  );

  const atMax = drafts.length >= MAX_COLLECTION_ATTRIBUTES;

  function addAttribute() {
    if (atMax) return;
    setDrafts((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        key: "",
        label: "",
        type: "text",
        description: "",
        optionsText: "",
      },
    ]);
  }

  function updateAttribute(clientId: string, patch: Partial<DraftAttribute>) {
    setDrafts((prev) =>
      prev.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)),
    );
  }

  function removeAttribute(clientId: string) {
    setDrafts((prev) => prev.filter((draft) => draft.clientId !== clientId));
  }

  const incomplete = drafts.some(
    (draft) =>
      draft.label.trim().length === 0 ||
      draft.description.trim().length === 0 ||
      (draft.type === "enum" && parseOptionsText(draft.optionsText).length === 0),
  );

  function handleSave() {
    if (pending || incomplete) return;
    // Assign keys: existing keys are preserved; new attributes derive a unique
    // key from their label now (and never change it again).
    const used = new Set<string>();
    for (const draft of drafts) {
      if (draft.key) used.add(draft.key);
    }
    const attributes: CollectionAttribute[] = drafts.map((draft) => {
      let key = draft.key;
      if (!key) {
        key = makeUniqueAttributeKey(draft.label, used);
        used.add(key);
      }
      const base = {
        key,
        label: draft.label.trim(),
        type: draft.type,
        description: draft.description.trim(),
      };
      return draft.type === "enum"
        ? { ...base, options: parseOptionsText(draft.optionsText) }
        : base;
    });
    onSubmit({ collectionId: collection.id, attributes });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Define schema for “{collection.name}”</DialogTitle>
          <DialogDescription>
            Attributes describe what to extract from this collection&rsquo;s
            documents: a name, a type, and a plain-language description.
            Nothing is extracted yet; this saves the definition.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto">
          {drafts.length === 0 ? (
            <p className="rounded-lg bg-paper-2 px-4 py-3 text-[13px] leading-[1.5] text-muted-foreground">
              No attributes yet. Add one to describe a fact to pull from each
              document, like a counterparty, an effective date, or an agreement
              type.
            </p>
          ) : (
            drafts.map((draft) => {
              const keyPreview = draft.key || slugifyAttributeKey(draft.label);
              return (
                <div
                  key={draft.clientId}
                  className="rounded-xl border border-hairline bg-paper-2 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`attr-label-${draft.clientId}`}
                        className="text-[12.5px] font-medium text-foreground"
                      >
                        Name
                      </label>
                      <Input
                        id={`attr-label-${draft.clientId}`}
                        value={draft.label}
                        onChange={(event) =>
                          updateAttribute(draft.clientId, { label: event.target.value })
                        }
                        placeholder="Effective date"
                        className="mt-1.5 bg-background"
                        maxLength={80}
                      />
                    </div>
                    <div className="w-[150px] shrink-0">
                      <label
                        htmlFor={`attr-type-${draft.clientId}`}
                        className="text-[12.5px] font-medium text-foreground"
                      >
                        Type
                      </label>
                      <select
                        id={`attr-type-${draft.clientId}`}
                        value={draft.type}
                        onChange={(event) =>
                          updateAttribute(draft.clientId, {
                            type: event.target.value as CollectionAttributeType,
                          })
                        }
                        className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {COLLECTION_ATTRIBUTE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {ATTRIBUTE_TYPE_LABEL[type]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttribute(draft.clientId)}
                      aria-label="Remove attribute"
                      className="mt-6 shrink-0 text-[13px] font-medium text-muted-foreground transition-colors hover:text-destructive motion-reduce:transition-none"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3">
                    <label
                      htmlFor={`attr-desc-${draft.clientId}`}
                      className="text-[12.5px] font-medium text-foreground"
                    >
                      Description
                    </label>
                    <Textarea
                      id={`attr-desc-${draft.clientId}`}
                      value={draft.description}
                      onChange={(event) =>
                        updateAttribute(draft.clientId, { description: event.target.value })
                      }
                      placeholder="The contract version number, often labeled Version or v near the title."
                      className="mt-1.5 bg-background"
                      rows={2}
                      maxLength={500}
                    />
                  </div>

                  {draft.type === "enum" ? (
                    <div className="mt-3">
                      <label
                        htmlFor={`attr-options-${draft.clientId}`}
                        className="text-[12.5px] font-medium text-foreground"
                      >
                        Options
                      </label>
                      <Input
                        id={`attr-options-${draft.clientId}`}
                        value={draft.optionsText}
                        onChange={(event) =>
                          updateAttribute(draft.clientId, { optionsText: event.target.value })
                        }
                        placeholder="NDA, MSA, SOW"
                        className="mt-1.5 bg-background"
                      />
                      <p className="mt-1 text-[11.5px] text-caption">
                        Separate the allowed values with commas.
                      </p>
                    </div>
                  ) : null}

                  <p className="mt-3 font-mono text-[11px] text-caption">
                    key: {keyPreview}
                    {draft.key ? "" : " (set on save)"}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAttribute}
            disabled={atMax}
            title={
              atMax
                ? `A schema can define at most ${MAX_COLLECTION_ATTRIBUTES} attributes.`
                : undefined
            }
          >
            Add attribute
          </Button>
          {atMax ? (
            <p className="text-[11.5px] text-caption">
              Maximum of {MAX_COLLECTION_ATTRIBUTES} reached.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || incomplete}
            title={
              incomplete
                ? "Give every attribute a name and a description (and options for a one-of type)."
                : undefined
            }
          >
            {pending ? "Saving…" : "Save schema"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
