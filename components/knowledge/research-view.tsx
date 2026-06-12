"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  ResearchAskComposer,
  type ScopeOption,
} from "@/components/knowledge/research-ask-composer";
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
import { deleteResearchRun, startResearchRun } from "@/lib/actions/research";
import type { ResearchRunView } from "@/lib/knowledge/research/shared";

/**
 * The Research surface (Knowledge arc Step 2; hierarchy polish): the ask is
 * the REUSABLE ResearchAskComposer (question hero, compact scope grid, live
 * selection feedback), this view owns the start transition and the handoff
 * to the live segmented run, and past runs list below, reopenable. The
 * composer's reusability is deliberate: follow-up refinement (the named next
 * feature) re-mounts it beneath an answer without touching this page.
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
  pricing,
  runs,
}: {
  collections: ScopeOption[];
  cap: number;
  pricing: { inputPerMillion: number; outputPerMillion: number };
  runs: ResearchRunView[];
}) {
  const router = useRouter();
  const [liveRun, setLiveRun] = useState<LiveRunInitial | null>(null);
  const [asked, setAsked] = useState<{
    question: string;
    collectionNames: string[];
  } | null>(null);
  const [pendingStart, startStart] = useTransition();
  // Deletion runs in THIS mounted view's transition (the b88a37f lesson),
  // with the established confirm dialog.
  const [deleteTarget, setDeleteTarget] = useState<ResearchRunView | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  function handleDeleteRun(run: ResearchRunView) {
    if (pendingDelete) return;
    startDelete(async () => {
      const result = await deleteResearchRun(run.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Run deleted. Cost records are retained.");
      router.refresh();
      setDeleteTarget(null);
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
        collectionNames: collections
          .filter((c) => collectionIds.includes(c.id))
          .map((c) => c.name),
      });
      // Hand off to the live runner; it advances the run from planning.
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
      {collections.length === 0 ? (
        <p className="max-w-[60ch] rounded-lg bg-paper-2 px-5 py-4 text-[13.5px] leading-[1.5] text-muted-foreground">
          Research runs over your collections, and there are none visible to
          you yet. Start in{" "}
          <Link
            href="/workspace/knowledge/collections"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Collections
          </Link>
          , where administrators draw scopes over the repositories your team
          already uses.
        </p>
      ) : (
        <ResearchAskComposer
          collections={collections}
          cap={cap}
          pricing={pricing}
          pending={pendingStart}
          onRun={handleRun}
        />
      )}

      {runs.length > 0 ? (
        <section aria-labelledby="research-history">
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
                  className="flex items-center gap-2 border-b border-hairline last:border-b-0"
                >
                  <Link
                    href={`/workspace/knowledge/research/${run.id}`}
                    className="group flex min-w-0 flex-1 items-center gap-4 rounded-lg bg-paper-2 px-4 py-3 transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-foreground">
                        {run.question}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {run.scope.map((c) => c.name).join(", ")} ·{" "}
                        {statusLabel(run.status)} ·{" "}
                        {run.documentsTotal > 0
                          ? `${run.documentsTotal} documents · `
                          : ""}
                        {relativeTime(run.createdAt)}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="shrink-0 text-primary opacity-40 transition-opacity duration-hover ease-soft group-hover:opacity-100 motion-reduce:transition-none"
                    >
                      →
                    </span>
                  </Link>
                  {/* Delete sits OUTSIDE the link (no nested interactives).
                      Settled runs only; an in-progress run cancels first. */}
                  {terminal ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(run)}
                      className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
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
              Its findings will be removed. Cost records are retained.
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
