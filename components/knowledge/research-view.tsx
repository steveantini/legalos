"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ResearchRunLive,
  type LiveRunInitial,
} from "@/components/knowledge/research-run-live";
import { statusLabel } from "@/components/knowledge/research-pieces";
import { startResearchRun } from "@/lib/actions/research";
import {
  estimateResearchPreview,
  type ResearchRunView,
} from "@/lib/knowledge/research/shared";
import { cn } from "@/lib/utils";

/**
 * The Research surface (Knowledge arc Step 2): ask an institutional question
 * across chosen collections. The scope picker shows every collection with
 * its TRANSPARENT PROVENANCE (the standing rule — real sources, always); the
 * COST PREVIEW renders before every run, computed locally from the inventory
 * counts, the org's cap, and the model's pricing, with its assumptions in
 * the fine print; and the run itself is the live segmented loop with partial
 * findings (ResearchRunLive). Past runs list below, reopenable.
 */

/** A collection as the scope picker needs it. */
export type ScopeOption = {
  id: string;
  name: string;
  description: string;
  provenance: string[];
  documentCount: number;
  lastSyncedAt: string | null;
};

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
  const [question, setQuestion] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [liveRun, setLiveRun] = useState<LiveRunInitial | null>(null);
  const [pendingStart, startStart] = useTransition();

  const selectedCollections = collections.filter((c) => selected.includes(c.id));
  const documentCount = selectedCollections.reduce(
    (sum, c) => sum + c.documentCount,
    0,
  );
  const preview =
    selected.length > 0
      ? estimateResearchPreview(documentCount, cap, pricing)
      : null;
  const canRun =
    question.trim().length >= 8 &&
    selected.length > 0 &&
    preview !== null &&
    !preview.overCap &&
    !pendingStart;

  function toggleCollection(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function handleRun() {
    if (!canRun || pendingStart) return;
    startStart(async () => {
      const result = await startResearchRun({
        question: question.trim(),
        collectionIds: selected,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
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

  if (liveRun) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-hairline bg-paper-2 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Question
          </p>
          <p className="mt-1 max-w-[75ch] text-[15px] leading-[1.5] text-foreground">
            {question}
          </p>
          <p className="mt-1.5 text-[12.5px] text-caption">
            Scoped to {selectedCollections.map((c) => c.name).join(", ")}.
          </p>
        </div>

        <ResearchRunLive initial={liveRun} initialFindings={[]} autoStart />

        <div>
          <button
            type="button"
            onClick={() => setLiveRun(null)}
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
        <div className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="research-question"
              className="text-[13px] font-medium text-foreground"
            >
              Your question
            </label>
            <Textarea
              id="research-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="How many of our customer contracts redlined the limitation of liability clause?"
              rows={3}
              maxLength={600}
              className="mt-1.5 max-w-[75ch] bg-paper-2"
            />
          </div>

          <fieldset>
            <legend className="text-[13px] font-medium text-foreground">
              Across which collections
            </legend>
            <div className="mt-2 flex flex-col gap-2">
              {collections.map((collection) => {
                const checked = selected.includes(collection.id);
                return (
                  <label
                    key={collection.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors duration-hover ease-soft motion-reduce:transition-none",
                      checked
                        ? "border-hairline-strong bg-secondary"
                        : "border-hairline bg-paper-2 hover:bg-secondary",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary"
                      checked={checked}
                      onChange={() => toggleCollection(collection.id)}
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[13.5px] font-medium text-foreground">
                          {collection.name}
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                          {collection.documentCount}{" "}
                          {collection.documentCount === 1
                            ? "document"
                            : "documents"}
                          {collection.lastSyncedAt
                            ? ` · synced ${relativeTime(collection.lastSyncedAt)}`
                            : " · not synced yet"}
                        </span>
                      </span>
                      {/* The transparency rule: the real sources, always. */}
                      {collection.provenance.map((path) => (
                        <span
                          key={path}
                          className="mt-0.5 block break-all font-mono text-[11.5px] text-caption"
                        >
                          {path}
                        </span>
                      ))}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {preview ? (
            <div className="max-w-[70ch] rounded-lg border border-hairline bg-paper-2 px-4 py-3">
              {preview.overCap ? (
                <p className="text-[13px] leading-[1.5] text-warn-fg">
                  This scope contains about {preview.documentCount} documents;
                  the per-run cap is {preview.cap}. Narrow the scope, or an
                  administrator can raise the cap in Policy &amp; access.
                </p>
              ) : (
                <p className="text-[13px] leading-[1.5] text-foreground">
                  About {preview.documentCount}{" "}
                  {preview.documentCount === 1 ? "document" : "documents"}{" "}
                  across {selectedCollections.length}{" "}
                  {selectedCollections.length === 1
                    ? "collection"
                    : "collections"}{" "}
                  · estimated ${preview.estCostLowUsd}–$
                  {preview.estCostHighUsd} · roughly {preview.estMinutesLow}–
                  {preview.estMinutesHigh} minutes.
                </p>
              )}
              <p className="mt-1 text-[11.5px] leading-[1.5] text-caption">
                Estimated from the synced inventory, assuming a typical legal
                document runs 2,000 to 10,000 tokens; the run reads live, so
                the real count is confirmed at the start. Each document is
                read once and never stored.
              </p>
            </div>
          ) : null}

          <div>
            <Button type="button" onClick={handleRun} disabled={!canRun}>
              {pendingStart ? "Starting…" : "Run research"}
            </Button>
          </div>
        </div>
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
            {runs.map((run) => (
              <div key={run.id} className="border-b border-hairline last:border-b-0">
                <Link
                  href={`/workspace/knowledge/research/${run.id}`}
                  className="group flex items-center gap-4 rounded-lg bg-paper-2 px-4 py-3 transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
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
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
