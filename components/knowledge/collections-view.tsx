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
import { FolderPickerDialog } from "@/components/knowledge/folder-picker-dialog";
import { SchemaBuilderDialog } from "@/components/knowledge/schema-builder-dialog";
import { usePrepareLoop } from "@/components/knowledge/use-prepare-loop";
import {
  addCollectionSource,
  deleteCollection,
  removeCollectionSource,
  saveCollection,
  saveCollectionSchema,
  syncCollection,
} from "@/lib/actions/collections";
import { type CollectionSchemaInput } from "@/lib/knowledge/collection-schema";
import type {
  CollectionInput,
  FolderDescriptor,
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
}: {
  collections: CollectionViewModel[];
  departments: { id: string; name: string }[];
  eligibleConnections: EligibleSourceConnection[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [schemaFor, setSchemaFor] = useState<CollectionViewModel | null>(null);
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
  // Per-collection preparation progress + the client-driven loop, shared with
  // Structured Query's guided-depth setup (presence = running; `verb` follows
  // the state, Prepare on first run, Update after).
  const { prepProgress, runPrepare } = usePrepareLoop();

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

  /** Add one or more picked folders as sources to a curated collection. The
   * shared FolderPickerDialog returns descriptors decoupled from any collection;
   * each becomes an addCollectionSource on the bound collection (a small multi-
   * add improvement over the old single-folder picker). These stay curated:
   * addCollectionSource never sets is_auto_folder, so it defaults false. */
  function handleAddFolders(collectionId: string, folders: FolderDescriptor[]) {
    if (pendingAddSource) return;
    startAddSource(async () => {
      let added = 0;
      for (const folder of folders) {
        const result = await addCollectionSource({
          collectionId,
          connectionId: folder.connectionId,
          rootReference: folder.rootReference,
          pathNames: folder.pathNames,
          recursive: folder.recursive,
        });
        if (!result.ok) {
          toast.error(result.error);
          break;
        }
        added += 1;
      }
      if (added > 0) {
        toast.success(
          added === 1
            ? "Source added. Run sync to build the inventory."
            : `${added} sources added. Run sync to build the inventory.`,
        );
        router.refresh();
      }
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
            ? "Nothing here yet. Point at a folder in a connected drive, like a contracts folder in Google Drive, to start working with its documents."
            : "Nothing is available to you yet. Your administrators connect the folders your team works with."}
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
        <FolderPickerDialog
          connections={eligibleConnections}
          pending={pendingAddSource}
          onClose={() => setPickerFor(null)}
          onConfirm={(folders) => handleAddFolders(pickerFor, folders)}
        />
      ) : null}

      {schemaFor ? (
        <SchemaBuilderDialog
          title={`Define fields for “${schemaFor.name}”`}
          description="Attributes describe what to extract from this collection's documents: a name, a type, and a plain-language description. Nothing is extracted yet; this saves the definition."
          initialAttributes={schemaFor.schemaAttributes}
          pending={pendingSchema}
          onClose={() => setSchemaFor(null)}
          onSubmit={(input) =>
            handleSaveSchema({ collectionId: schemaFor.id, attributes: input.attributes })
          }
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
            A set of folders from your connected drives. Folders are added after
            saving.
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
