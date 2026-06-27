"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FolderPickerDialog } from "@/components/knowledge/folder-picker-dialog";
import { SchemaSuggestionReview } from "@/components/knowledge/schema-suggestion-review";
import { StructuredQueryComposer } from "@/components/knowledge/structured-query-composer";
import { StructuredQueryGuidedDepth } from "@/components/knowledge/structured-query-guided-depth";
import { StructuredQueryResultView } from "@/components/knowledge/structured-query-result";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addStructuredQueryFolders,
  askStructuredQuestion,
  deleteStructuredQuery,
  rerunStructuredQuery,
} from "@/lib/actions/structured-query";
import { syncCollection } from "@/lib/actions/collections";
import type { EligibleSourceConnection } from "@/lib/knowledge/collections-data";
import type { FolderDescriptor } from "@/lib/knowledge/collections-shared";
import {
  groupFoldersByKind,
  type KindGroup,
  type QueryFolder,
} from "@/lib/knowledge/document-kinds";
import type { SchemaSuggestionView } from "@/lib/knowledge/schema-suggestions-shared";
import type {
  PresentedResult,
  StructuredQueryHistoryItem,
} from "@/lib/knowledge/structured-query-shared";
import type { SyncCursor } from "@/lib/knowledge/sync";

/**
 * The Structured Query surface (folders rework, Step 3b). Folder-picking is the
 * scoping act; the picks resolve to a document KIND, and the ask runs over the
 * whole kind. The view owns the available folders, the selection, the chosen
 * kind, and the ask/result/history. Three resolution states drive what renders
 * below the composer: one set-up, prepared kind → ask; the picks span several
 * kinds → choose one; a kind isn't set up or prepared → guided depth (admins) or
 * an honest wait (members). Mirrors the Research view's shape on purpose.
 */

/** Distinguish the "not set up yet" group (schemaId null) from "no kind chosen". */
function groupKey(group: KindGroup): string {
  return group.schemaId ?? "__unset__";
}

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

export function StructuredQueryView({
  folders,
  canSetUpFolders,
  connections,
  history,
  suggestions,
}: {
  folders: QueryFolder[];
  /** Whether the viewer may add folders and set up kinds (the admin path). */
  canSetUpFolders: boolean;
  /** Eligible connections for the folder picker (admins only). */
  connections: EligibleSourceConnection[];
  history: StructuredQueryHistoryItem[];
  suggestions: SchemaSuggestionView[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<PresentedResult | null>(null);
  const [lastSchemaId, setLastSchemaId] = useState<string | null>(null);
  const [prefillQuestion, setPrefillQuestion] = useState("");
  const [pending, startAsk] = useTransition();

  // Selection is owned here so a freshly added folder auto-selects; available
  // folders merge the server list with optimistically-added picks (which dedupe
  // out once router.refresh brings them into the server list).
  const [selected, setSelected] = useState<string[]>([]);
  const [extras, setExtras] = useState<QueryFolder[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingAdd, startAdd] = useTransition();

  const [deleteTarget, setDeleteTarget] = useState<StructuredQueryHistoryItem | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  const available: QueryFolder[] = [
    ...folders,
    ...extras.filter((e) => !folders.some((f) => f.id === e.id)),
  ];

  // Resolve the picked folders to the kind(s) they share.
  const selectedFolders = available.filter((f) => selected.includes(f.id));
  const groups = groupFoldersByKind(selectedFolders);
  const activeGroup =
    groups.length === 1
      ? groups[0]
      : groups.find((g) => groupKey(g) === activeKey) ?? null;
  const askable =
    activeGroup && activeGroup.hasSchema && activeGroup.prepared ? activeGroup : null;

  function handleToggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
    // A change in scope can change the resolved kind; let it re-resolve.
    setActiveKey(null);
  }

  /** Best-effort, fire-and-forget sync after a folder is added, so it has an
   * inventory to prepare. Failures never block setup. */
  function bestEffortSync(collectionId: string) {
    void (async () => {
      try {
        let cursor: SyncCursor | null = null;
        let sourceIds: string[] | null = null;
        for (let i = 0; i < 30; i += 1) {
          const result = await syncCollection({ collectionId, cursor, sourceIds });
          if (!result.ok || result.completed) break;
          cursor = result.cursor;
          sourceIds = result.sourceIds;
        }
      } catch {
        // Best-effort; preparation reconciles the inventory regardless.
      }
      router.refresh();
    })();
  }

  function handlePickerConfirm(picked: FolderDescriptor[]) {
    if (pendingAdd || picked.length === 0) return;
    startAdd(async () => {
      const result = await addStructuredQueryFolders({ folders: picked });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setExtras((prev) => {
        const known = new Set(prev.map((e) => e.id));
        return [...prev, ...result.folders.filter((f) => !known.has(f.id))];
      });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const f of result.folders) next.add(f.id);
        return [...next];
      });
      setActiveKey(null);
      setPickerOpen(false);
      for (const f of result.folders) bestEffortSync(f.id);
    });
  }

  function handleRun(question: string, schemaId: string) {
    if (pending) return;
    setLastSchemaId(schemaId);
    startAsk(async () => {
      const response = await askStructuredQuestion({ schemaId, question });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setResult(response.result);
      router.refresh(); // the new question joins the history
    });
  }

  function handleRerun(item: StructuredQueryHistoryItem) {
    if (pending) return;
    setLastSchemaId(
      available.find((f) => f.id === item.collectionId)?.schemaId ?? null,
    );
    startAsk(async () => {
      const response = await rerunStructuredQuery(item.id);
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setResult(response.result);
      router.refresh();
    });
  }

  function handleAdjust() {
    if (!result) return;
    setPrefillQuestion(result.question);
    // Re-scope to the kind the answer ran over, so the composer reappears ready.
    if (lastSchemaId) {
      const kindFolders = available
        .filter((f) => f.schemaId === lastSchemaId)
        .map((f) => f.id);
      if (kindFolders.length > 0) setSelected(kindFolders);
      setActiveKey(lastSchemaId);
    }
    setResult(null);
  }

  function handleDelete(item: StructuredQueryHistoryItem) {
    if (pendingDelete) return;
    startDelete(async () => {
      const response = await deleteStructuredQuery(item.id);
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      toast.success("Question deleted.");
      setDeleteTarget(null);
      router.refresh();
    });
  }

  if (result) {
    // The representative folder of the answer's kind, for the gap → suggest flow.
    const representativeId =
      available.find((f) => f.schemaId === lastSchemaId)?.id ?? null;
    return (
      <StructuredQueryResultView
        result={result}
        collectionId={representativeId}
        onAdjust={handleAdjust}
        onAskAnother={() => {
          setResult(null);
          setPrefillQuestion("");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <StructuredQueryComposer
        folders={available}
        selected={selected}
        onToggle={handleToggle}
        onAddFolders={canSetUpFolders ? () => setPickerOpen(true) : undefined}
        askSchemaId={askable?.schemaId ?? null}
        askKindName={askable?.schemaName ?? null}
        askFields={askable?.attributes ?? []}
        pending={pending}
        onRun={handleRun}
        initialQuestion={prefillQuestion}
      />

      {/* Disambiguation: the picks span several kinds. Choose one to ask about. */}
      {groups.length > 1 ? (
        <KindChooser groups={groups} activeKey={activeKey} onPick={setActiveKey} />
      ) : null}

      {/* Guided depth: the chosen kind isn't askable yet. Admins set it up here;
          members get an honest wait. */}
      {activeGroup && !askable ? (
        canSetUpFolders ? (
          <StructuredQueryGuidedDepth group={activeGroup} />
        ) : (
          <p className="max-w-[75ch] rounded-xl border border-hairline bg-paper-2 p-5 text-[14px] leading-[1.55] text-muted-foreground">
            {activeGroup.folderIds.length === 1
              ? "This folder isn't"
              : "These folders aren't"}{" "}
            set up to query yet. Once an administrator sets up the document kind,
            you can ask precise questions about it here.
          </p>
        )
      ) : null}

      {suggestions.length > 0 ? (
        <section aria-labelledby="structured-query-suggestions">
          <h2
            id="structured-query-suggestions"
            className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
          >
            Suggested fields
          </h2>
          <div className="mt-2 flex flex-col gap-2">
            {suggestions.map((suggestion) => (
              <div key={suggestion.id}>
                <p className="mb-1 text-[12px] text-caption">
                  From &ldquo;{suggestion.sourceQuestion}&rdquo; · {suggestion.collectionName}
                </p>
                <SchemaSuggestionReview suggestion={suggestion} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Zone 2: history. A quiet hairline marks the break from the scope zone
          above; the rows are flat at rest so the zone recedes as reference. */}
      {history.length > 0 ? (
        <section
          aria-labelledby="structured-query-history"
          className="border-t border-hairline pt-7"
        >
          <h2
            id="structured-query-history"
            className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
          >
            Recent questions
          </h2>
          <div className="mt-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 border-b border-hairline last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => handleRerun(item)}
                  disabled={pending}
                  className="flex min-w-0 flex-1 items-center gap-4 rounded-lg px-4 py-2.5 text-left transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-foreground">
                      {item.question}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-caption">
                      {item.understood
                        ? `${item.matchedCount ?? 0} of ${item.totalCount ?? 0} · ${item.interpretedSummary}`
                        : "Not tracked by this document kind"}{" "}
                      · {item.collectionName} · {relativeTime(item.createdAt)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(item)}
                  aria-label="Delete this question"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground/45 transition-colors duration-hover ease-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                >
                  <Trash2 aria-hidden className="size-[15px]" strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {pickerOpen ? (
        <FolderPickerDialog
          connections={connections}
          pending={pendingAdd}
          onClose={() => setPickerOpen(false)}
          onConfirm={handlePickerConfirm}
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
            <DialogTitle>Delete this question?</DialogTitle>
            <DialogDescription>
              It will be removed from your recent questions. Usage records are
              retained.
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
              {pendingDelete ? "Deleting…" : "Delete question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The "which kind?" chooser, shown when the picked folders span several kinds.
 * Each option states the kind and whether it's ready, so the choice is honest. */
function KindChooser({
  groups,
  activeKey,
  onPick,
}: {
  groups: KindGroup[];
  activeKey: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <section aria-labelledby="structured-query-kinds">
      <h2
        id="structured-query-kinds"
        className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
      >
        These folders track different things. Pick one to ask about.
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {groups.map((group) => {
          const key = group.schemaId ?? "__unset__";
          const ready = group.hasSchema && group.prepared;
          const status = !group.hasSchema
            ? "not set up"
            : group.prepared
              ? "ready"
              : "needs preparing";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-pressed={activeKey === key}
              className={`rounded-lg border px-4 py-3 text-left transition-colors duration-hover ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${
                activeKey === key
                  ? "border-hairline-strong bg-secondary"
                  : "border-hairline bg-paper-2 hover:bg-secondary"
              }`}
            >
              <span className="block text-[13.5px] font-medium text-foreground">
                {group.schemaName ?? "Not set up yet"}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-caption">
                {group.folderIds.length}{" "}
                {group.folderIds.length === 1 ? "folder" : "folders"} ·{" "}
                {group.documentCount}{" "}
                {group.documentCount === 1 ? "document" : "documents"} ·{" "}
                <span className={ready ? "text-caption" : "text-warn-fg"}>{status}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
