"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  estimateResearchPreview,
  type ResearchPreview,
} from "@/lib/knowledge/research/shared";
import { cn } from "@/lib/utils";

/**
 * The Research ask composer (Knowledge arc Step 2, hierarchy polish): the
 * QUESTION IS THE HERO — a wide, composer-grade box that invites a real
 * institutional question — and the scope is supporting cast: a compact,
 * responsive grid of collection cards, each keeping its real source visible
 * in condensed form (the standing transparency rule), with a quiet summary
 * line that turns the cost preview into live feedback as scopes toggle.
 *
 * A REUSABLE component on purpose: it owns its own question/selection state
 * and reports the ask upward through `onRun`, so when follow-up refinement
 * arrives (asking against a prior run's result set, the named next feature)
 * the same composer can reappear beneath an answer in a thread-like sequence
 * with no redo. Presentation only — the preview math, caps, and run behavior
 * are exactly the engine's.
 */

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

export function ResearchAskComposer({
  collections,
  cap,
  pricing,
  pending,
  onRun,
}: {
  collections: ScopeOption[];
  cap: number;
  pricing: { inputPerMillion: number; outputPerMillion: number };
  pending: boolean;
  onRun: (question: string, collectionIds: string[]) => void;
}) {
  const questionId = useId();
  const [question, setQuestion] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const selectedCollections = collections.filter((c) =>
    selected.includes(c.id),
  );
  const documentCount = selectedCollections.reduce(
    (sum, c) => sum + c.documentCount,
    0,
  );
  const preview: ResearchPreview | null =
    selected.length > 0
      ? estimateResearchPreview(documentCount, cap, pricing)
      : null;
  const canRun =
    question.trim().length >= 8 &&
    preview !== null &&
    !preview.overCap &&
    !pending;

  function toggleCollection(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The hero: a wide, generous, composer-grade question. */}
      <div className="rounded-xl border border-hairline bg-paper-2 transition-colors duration-release ease-release focus-within:border-hairline-strong motion-reduce:transition-none">
        <label htmlFor={questionId} className="sr-only">
          Your question
        </label>
        <textarea
          id={questionId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="How many of our MSAs were signed without a DPA?"
          rows={3}
          maxLength={600}
          className="block w-full resize-none bg-transparent px-5 pt-4 text-[16px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground/70 field-sizing-content min-h-[5.2em] max-h-[12em]"
        />
        <div className="flex items-center justify-between gap-3 px-5 pb-3.5 pt-1">
          <p className="text-[12px] leading-[1.5] text-caption">
            Every document in scope is read where it lives; the answer comes
            back cited.
          </p>
          <Button
            type="button"
            onClick={() => canRun && onRun(question.trim(), selected)}
            disabled={!canRun}
          >
            {pending ? "Starting…" : "Run research"}
          </Button>
        </div>
      </div>

      {/* Supporting cast: the scope, compact and multi-column. */}
      <fieldset>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <legend className="text-[13px] font-medium text-foreground">
            Across which collections
          </legend>
          {/* The live selection summary: the preview as feedback, the same
              math the confirm line below uses. */}
          <p className="text-[12.5px] text-muted-foreground" aria-live="polite">
            {preview
              ? `${selectedCollections.length} ${
                  selectedCollections.length === 1
                    ? "collection"
                    : "collections"
                } · ~${preview.documentCount} ${
                  preview.documentCount === 1 ? "document" : "documents"
                } · estimated $${preview.estCostLowUsd}–$${preview.estCostHighUsd}`
              : "Pick at least one collection"}
          </p>
        </div>

        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((collection) => {
            const checked = selected.includes(collection.id);
            return (
              <label
                key={collection.id}
                title={
                  collection.lastSyncedAt
                    ? `Synced ${relativeTime(collection.lastSyncedAt)}`
                    : "Not synced yet"
                }
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border px-3.5 py-2.5 transition-colors duration-hover ease-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring motion-reduce:transition-none",
                  checked
                    ? "border-hairline-strong bg-secondary"
                    : "border-hairline bg-paper-2 hover:bg-secondary",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleCollection(collection.id)}
                />
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[13.5px] font-medium text-foreground">
                    {collection.name}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                    {collection.documentCount}{" "}
                    {collection.documentCount === 1 ? "doc" : "docs"}
                  </span>
                </span>
                {/* Condensed, always-present provenance (the transparency
                    rule; never hover-only). */}
                {collection.provenance.map((path) => (
                  <span
                    key={path}
                    className="block truncate font-mono text-[11px] leading-[1.5] text-caption"
                  >
                    {path}
                  </span>
                ))}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* The full confirm preview: the same numbers as the live line, plus
          the stated assumptions and the honest over-cap message. */}
      {preview ? (
        <div className="max-w-[70ch] rounded-lg border border-hairline bg-paper-2 px-4 py-3">
          {preview.overCap ? (
            <p className="text-[13px] leading-[1.5] text-warn-fg">
              This scope contains about {preview.documentCount} documents; the
              per-run cap is {preview.cap}. Narrow the scope, or an
              administrator can raise the cap in Policy &amp; access.
            </p>
          ) : (
            <p className="text-[13px] leading-[1.5] text-foreground">
              About {preview.documentCount}{" "}
              {preview.documentCount === 1 ? "document" : "documents"} across{" "}
              {selectedCollections.length}{" "}
              {selectedCollections.length === 1 ? "collection" : "collections"}{" "}
              · estimated ${preview.estCostLowUsd}–${preview.estCostHighUsd} ·
              roughly {preview.estMinutesLow}–{preview.estMinutesHigh} minutes.
            </p>
          )}
          <p className="mt-1 text-[11.5px] leading-[1.5] text-caption">
            Estimated from the synced inventory, assuming a typical legal
            document runs 2,000 to 10,000 tokens; the run reads live, so the
            real count is confirmed at the start. Each document is read once
            and never stored.
          </p>
        </div>
      ) : null}
    </div>
  );
}
