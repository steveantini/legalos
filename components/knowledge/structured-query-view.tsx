"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import { SchemaSuggestionReview } from "@/components/knowledge/schema-suggestion-review";
import { StructuredQueryComposer } from "@/components/knowledge/structured-query-composer";
import { StructuredQueryResultView } from "@/components/knowledge/structured-query-result";
import { Button, buttonVariants } from "@/components/ui/button";
import type { SchemaSuggestionView } from "@/lib/knowledge/schema-suggestions-shared";
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
  schemalessCollections,
  canDefineSchemas,
  history,
  suggestions,
}: {
  collections: QueryableCollection[];
  /** Visible, synced collections that have NO schema yet (an admin's next step
   * is to define one). Used only to choose the right empty state. */
  schemalessCollections: { id: string; name: string }[];
  /** Whether the viewer may define schemas (the super-admin schema-write gate). */
  canDefineSchemas: boolean;
  history: StructuredQueryHistoryItem[];
  suggestions: SchemaSuggestionView[];
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
        collectionId={lastCollectionId}
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
        <StructuredQueryEmptyState
          canDefineSchemas={canDefineSchemas}
          schemalessCollections={schemalessCollections}
        />
      ) : (
        <StructuredQueryComposer
          collections={collections}
          pending={pending}
          onRun={handleRun}
          initialQuestion={prefill?.question ?? ""}
          initialCollectionId={prefill?.collectionId ?? null}
        />
      )}

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

/**
 * The state-aware, role-aware empty state. The composer gate is SCHEMA-DEFINED
 * (a collection with `schemaAttributes.length > 0`), never preparation, so an
 * empty surface means no visible collection has a schema yet. Three honest
 * situations, each with the precise next action:
 *  A) an admin with synced collection(s) but no schema → define the fields
 *     (deep-linked to define-schema on the specific collection when there's one);
 *  B) an admin with no collections at all → set up a collection first;
 *  C) a member with nothing set up → honest wait-for-admin, no dead-end button.
 */
function StructuredQueryEmptyState({
  canDefineSchemas,
  schemalessCollections,
}: {
  canDefineSchemas: boolean;
  schemalessCollections: { id: string; name: string }[];
}) {
  // STATE C — the viewer cannot define schemas and nothing is set up for them.
  if (!canDefineSchemas) {
    return (
      <EmptyCard>
        Your team hasn&rsquo;t set up any fields to query yet. Once an
        administrator does, this is where you&rsquo;ll ask precise questions about
        your documents.
      </EmptyCard>
    );
  }

  // STATE B — an admin with no collections at all.
  if (schemalessCollections.length === 0) {
    return (
      <EmptyCard action={{ href: "/workspace/knowledge/collections", label: "Set up a collection" }}>
        Set up a collection of documents first, then define the fields you want
        to track, and you can ask exact questions about them here.
      </EmptyCard>
    );
  }

  // STATE A — an admin with synced collection(s), but none has a schema yet.
  // Deep-link to define-schema on the specific collection when there is one.
  const single = schemalessCollections.length === 1 ? schemalessCollections[0] : null;
  const action = single
    ? { href: `/workspace/knowledge/collections?schema=${single.id}`, label: "Define fields" }
    : { href: "/workspace/knowledge/collections", label: "Define fields" };
  return (
    <EmptyCard action={action}>
      {single ? (
        <>
          <span className="font-medium text-foreground">{single.name}</span> is
          synced and ready. Define the fields you want to track, like agreement
          type or effective date, and you can start asking exact questions about
          them.
        </>
      ) : (
        <>
          Your collections are synced and ready. Define the fields you want to
          track on one, like agreement type or effective date, and you can start
          asking exact questions about them.
        </>
      )}
    </EmptyCard>
  );
}

/** A muted empty-state card with an optional primary action that reads as a
 * single obvious next click (a button-styled link). */
function EmptyCard({
  children,
  action,
}: {
  children: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex max-w-[62ch] flex-col items-start gap-3 rounded-lg bg-paper-2 px-5 py-4">
      <p className="text-[13.5px] leading-[1.5] text-muted-foreground">{children}</p>
      {action ? (
        <Link href={action.href} className={buttonVariants()}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
