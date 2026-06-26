"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StructuredQueryComposer } from "@/components/knowledge/structured-query-composer";
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
  askStructuredQuestion,
  deleteStructuredQuery,
  rerunStructuredQuery,
} from "@/lib/actions/structured-query";
import type {
  PresentedResult,
  QueryableCollection,
  StructuredQueryHistoryItem,
} from "@/lib/knowledge/structured-query-shared";

/**
 * The Structured Query surface (commit 5): the reusable composer, the result
 * presentation, and the history of recent questions. Mirrors the Research view's
 * shape on purpose (sibling under Knowledge, and a clean future merge), but the
 * work is a single synchronous ask, not a segmented run, so there is no live
 * loop: the action translates, runs the pure engine, and returns the full
 * answer. History makes persistence visible and re-runnable.
 */

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
  collections,
  history,
}: {
  collections: QueryableCollection[];
  history: StructuredQueryHistoryItem[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<PresentedResult | null>(null);
  const [lastCollectionId, setLastCollectionId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ question: string; collectionId: string } | null>(
    null,
  );
  const [pending, startAsk] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<StructuredQueryHistoryItem | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  function handleRun(question: string, collectionId: string) {
    if (pending) return;
    setLastCollectionId(collectionId);
    startAsk(async () => {
      const response = await askStructuredQuestion({ collectionId, question });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setResult(response.result);
      setPrefill(null);
      router.refresh(); // the new question joins the history
    });
  }

  function handleRerun(item: StructuredQueryHistoryItem) {
    if (pending) return;
    setLastCollectionId(item.collectionId);
    startAsk(async () => {
      const response = await rerunStructuredQuery(item.id);
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setResult(response.result);
      setPrefill(null);
      router.refresh();
    });
  }

  function handleAdjust() {
    if (result) {
      setPrefill({
        question: result.question,
        collectionId: lastCollectionId ?? "",
      });
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
    return (
      <StructuredQueryResultView
        result={result}
        onAdjust={handleAdjust}
        onAskAnother={() => {
          setResult(null);
          setPrefill(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {collections.length === 0 ? (
        <p className="max-w-[62ch] rounded-lg bg-paper-2 px-5 py-4 text-[13.5px] leading-[1.5] text-muted-foreground">
          Structured Query answers exact questions about the fields a collection
          tracks, and there are no prepared collections visible to you yet. An
          administrator defines the fields and prepares a collection in{" "}
          <Link
            href="/workspace/knowledge/collections"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Collections
          </Link>
          ; once that&rsquo;s done, you can ask here.
        </p>
      ) : (
        <StructuredQueryComposer
          collections={collections}
          pending={pending}
          onRun={handleRun}
          initialQuestion={prefill?.question ?? ""}
          initialCollectionId={prefill?.collectionId ?? null}
        />
      )}

      {history.length > 0 ? (
        <section aria-labelledby="structured-query-history">
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
                className="flex items-center gap-2 border-b border-hairline last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => handleRerun(item)}
                  disabled={pending}
                  className="group flex min-w-0 flex-1 items-center gap-4 rounded-lg bg-paper-2 px-4 py-3 text-left transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-foreground">
                      {item.question}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {item.understood
                        ? `${item.matchedCount ?? 0} of ${item.totalCount ?? 0} · ${item.interpretedSummary}`
                        : "Not tracked by this collection"}{" "}
                      · {item.collectionName} · {relativeTime(item.createdAt)}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-primary opacity-40 transition-opacity duration-hover ease-soft group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    →
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(item)}
                  className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                >
                  Delete
                </button>
              </div>
            ))}
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
