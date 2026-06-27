"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FolderPickerDialog } from "@/components/knowledge/folder-picker-dialog";
import { ResearchAskComposer } from "@/components/knowledge/research-ask-composer";
import {
  ResearchRunLive,
  type LiveRunInitial,
} from "@/components/knowledge/research-run-live";
import { statusLabel } from "@/components/knowledge/research-pieces";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { syncCollection } from "@/lib/actions/collections";
import {
  addResearchFolders,
  deleteResearchRun,
  startResearchRun,
} from "@/lib/actions/research";
import type { EligibleSourceConnection } from "@/lib/knowledge/collections-data";
import type { FolderDescriptor } from "@/lib/knowledge/collections-shared";
import type { ResearchRunView, ScopeOption } from "@/lib/knowledge/research/shared";
import type { SyncCursor } from "@/lib/knowledge/sync";

/**
 * The Research surface (Knowledge folders rework, Step 2): folder-picking is the
 * scoping act. The view owns the available folders + the selection, lets admins
 * add folders from a connected drive (find-or-create an invisible folder-backed
 * collection per pick, then best-effort sync), and hands the selected folder
 * collection ids to the unchanged research engine via startResearchRun. Members
 * pick from already-available folders (no add affordance). Past runs sit below.
 */

export type { ScopeOption };

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

export function ResearchView({
  collections,
  cap,
  runs,
  canSetUpFolders,
  connections,
}: {
  collections: ScopeOption[];
  cap: number;
  runs: ResearchRunView[];
  /** Whether the viewer may add new folders (the admin path; step 2). */
  canSetUpFolders: boolean;
  /** Eligible connections for the folder picker (admins only). */
  connections: EligibleSourceConnection[];
}) {
  const router = useRouter();
  const [liveRun, setLiveRun] = useState<LiveRunInitial | null>(null);
  const [asked, setAsked] = useState<{
    question: string;
    collectionNames: string[];
  } | null>(null);
  const [pendingStart, startStart] = useTransition();
  // Selection is owned here so a freshly added folder can auto-select; available
  // folders merge the server list with optimistically-added picks (which dedupe
  // out once router.refresh brings them into the server list).
  const [selected, setSelected] = useState<string[]>([]);
  const [extras, setExtras] = useState<ScopeOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingAdd, startAdd] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ResearchRunView | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  const available: ScopeOption[] = [
    ...collections,
    ...extras.filter((e) => !collections.some((c) => c.id === e.id)),
  ];

  function handleToggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  /** Best-effort, fire-and-forget sync after a folder is added. Research reads
   * live, so this only freshens the preview count; failures never block a run. */
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
        // Sync is best-effort; the run works against live documents regardless.
      }
      router.refresh();
    })();
  }

  function handlePickerConfirm(folders: FolderDescriptor[]) {
    if (pendingAdd || folders.length === 0) return;
    startAdd(async () => {
      const result = await addResearchFolders({ folders });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setExtras((prev) => {
        const known = new Set(prev.map((e) => e.id));
        return [...prev, ...result.scopeOptions.filter((s) => !known.has(s.id))];
      });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const s of result.scopeOptions) next.add(s.id);
        return [...next];
      });
      setPickerOpen(false);
      for (const s of result.scopeOptions) bestEffortSync(s.id);
    });
  }

  function handleRun(question: string, collectionIds: string[]) {
    if (pendingStart) return;
    startStart(async () => {
      const result = await startResearchRun({ question, collectionIds });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAsked({
        question,
        collectionNames: available
          .filter((c) => collectionIds.includes(c.id))
          .map((c) => c.name),
      });
      setLiveRun({
        runId: result.runId,
        status: "planning",
        documentsTotal: 0,
        documentsProcessed: 0,
        documentsFailed: 0,
        skippedUnsupported: 0,
        answer: null,
        citations: [],
        basis: null,
        failureReason: null,
      });
    });
  }

  function handleDeleteRun(run: ResearchRunView) {
    if (pendingDelete) return;
    startDelete(async () => {
      const result = await deleteResearchRun(run.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Run deleted. Usage records are retained.");
      router.refresh();
      setDeleteTarget(null);
    });
  }

  if (liveRun && asked) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-hairline bg-paper-2 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Question
          </p>
          <p className="mt-1 max-w-[75ch] text-[15px] leading-[1.5] text-foreground">
            {asked.question}
          </p>
          <p className="mt-1.5 text-[12.5px] text-caption">
            Scoped to {asked.collectionNames.join(", ")}.
          </p>
        </div>

        <ResearchRunLive initial={liveRun} initialFindings={[]} autoStart />

        <div>
          <button
            type="button"
            onClick={() => {
              setLiveRun(null);
              setAsked(null);
            }}
            className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            Ask another question
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ResearchAskComposer
        collections={available}
        selected={selected}
        onToggle={handleToggle}
        onAddFolders={canSetUpFolders ? () => setPickerOpen(true) : undefined}
        cap={cap}
        pending={pendingStart}
        onRun={handleRun}
      />

      {/* Zone 2: history. A quiet hairline marks the break from the scope zone
          above; the rows are flat at rest so the zone recedes as reference
          material. Mirrors the Structured Query recent-questions treatment. */}
      {runs.length > 0 ? (
        <section
          aria-labelledby="research-history"
          className="border-t border-hairline pt-7"
        >
          <h2
            id="research-history"
            className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
          >
            Past runs
          </h2>
          <div className="mt-2">
            {runs.map((run) => {
              const terminal =
                run.status === "completed" ||
                run.status === "failed" ||
                run.status === "cancelled";
              return (
                <div
                  key={run.id}
                  className="flex items-center gap-1 border-b border-hairline last:border-b-0"
                >
                  <Link
                    href={`/workspace/knowledge/research/${run.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4 rounded-lg px-4 py-2.5 transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">
                        {run.question}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-caption">
                        {run.scope.map((c) => c.name).join(", ")} ·{" "}
                        {statusLabel(run.status)} ·{" "}
                        {run.documentsTotal > 0
                          ? `${run.documentsTotal} documents · `
                          : ""}
                        {relativeTime(run.createdAt)}
                      </span>
                    </span>
                  </Link>
                  {terminal ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(run)}
                      aria-label="Delete this run"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground/45 transition-colors duration-hover ease-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                    >
                      <Trash2 aria-hidden className="size-[15px]" strokeWidth={1.75} />
                    </button>
                  ) : null}
                </div>
              );
            })}
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
            <DialogTitle>Delete this research run?</DialogTitle>
            <DialogDescription>
              Its findings will be removed. Usage records are retained.
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
              onClick={() => deleteTarget && handleDeleteRun(deleteTarget)}
              disabled={pendingDelete}
            >
              {pendingDelete ? "Deleting…" : "Delete run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
