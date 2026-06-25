"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import {
  docCapExceededMessage,
  estimateResearchPreview,
  RESEARCH_DOC_CAP_WHY,
  type ResearchPreview,
} from "@/lib/knowledge/research/shared";
import { cn } from "@/lib/utils";

/**
 * The Research ask composer (Knowledge arc Step 2, hierarchy polish): the
 * QUESTION IS THE HERO — a persistent instruction line in real text, then a
 * wide, composer-grade box whose placeholder is a brief example (guidance
 * must survive the first keystroke; a placeholder vanishes) — and the scope
 * is supporting cast: a collapsible "Scope" section in the launchpad's
 * sectioning idiom (default EXPANDED; session-transient collapse, since
 * scope is a required gesture), holding the compact responsive grid of
 * collection cards, each keeping its real source visible in condensed form
 * (the standing transparency rule). The section's subline IS the live
 * summary: "Select at least one collection to begin." until a scope is
 * picked, then the document-and-time estimate — one line, one location, no
 * standing nag; the Run button simply stays disabled until the ask is valid.
 * No money is ever shown: the per-run document limit, not a dollar figure, is
 * the deliberate-scope lever.
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
  pending,
  onRun,
}: {
  collections: ScopeOption[];
  cap: number;
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
    selected.length > 0 ? estimateResearchPreview(documentCount, cap) : null;
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

  // The section subline IS the live selection summary — guidance with
  // nothing selected, the running estimate once scopes are picked, in the
  // units that matter to the asker: documents and time. No money: usage is
  // still recorded to the ledger for admin analytics, but spend never appears
  // on this surface. Same preview math as the confirm box, so the two can
  // never disagree.
  const scopeSummary = preview
    ? `${selectedCollections.length} ${
        selectedCollections.length === 1 ? "collection" : "collections"
      } · ~${preview.documentCount} ${
        preview.documentCount === 1 ? "document" : "documents"
      } · roughly ${preview.estMinutesLow}–${preview.estMinutesHigh} minutes.`
    : "Select at least one collection to begin.";

  return (
    <div className="flex flex-col gap-6">
      {/* The hero: the wide, composer-grade question. The page intro is the
          single explainer; the placeholder stays a brief example. */}
      <div className="rounded-xl border border-hairline bg-paper-2 transition-colors duration-release ease-release focus-within:border-hairline-strong motion-reduce:transition-none">
        <label htmlFor={questionId} className="sr-only">
          Your question
        </label>
        <textarea
          id={questionId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Which of our vendor agreements auto-renew?"
          rows={3}
          maxLength={600}
          className="block w-full resize-none bg-transparent px-5 pt-4 text-[16px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground/70 field-sizing-content min-h-[5.2em] max-h-[12em]"
        />
        <div className="flex items-center justify-end px-5 pb-3.5 pt-1">
          <Button
            type="button"
            onClick={() => canRun && onRun(question.trim(), selected)}
            disabled={!canRun}
          >
            {pending ? "Starting…" : "Run research"}
          </Button>
        </div>
      </div>

      {/* Supporting cast: the Scope section in the launchpad's collapsible
          idiom — default expanded, transient collapse (no preferenceKey),
          the live summary as the subline (it survives a collapse, so the
          selection state is never hidden). No count badge here: the subline
          already states the collection count, and saying it twice is noise. */}
      <CollapsibleSection
        title="Scope"
        sectionKey="research-scope"
        defaultCollapsed={false}
        description={<span aria-live="polite">{scopeSummary}</span>}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
      </CollapsibleSection>

      {/* The confirm preview. Under the cap: an honest hedged scope signal
          (the inventory count can diverge from the live count, so "About",
          and the exact number lands post-start as "Reading documents… X of
          Y"). Over the cap: the document-cap pre-empt (message A) with an
          inline "why" — the friendly pre-launch stop; the engine stays the
          real guard. The enumeration-budget limit can't be known pre-run, so
          it never appears here, only as a post-enumeration failure. */}
      {preview ? (
        preview.overCap ? (
          <div className="max-w-[70ch] rounded-lg border border-warn-fg/30 bg-paper-2 px-4 py-3">
            <p className="text-[13px] leading-[1.5] text-warn-fg">
              {docCapExceededMessage(preview.documentCount, preview.cap)}
            </p>
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Why is there a limit?
              </summary>
              <p className="mt-1.5 text-[12px] leading-[1.5] text-caption">
                {RESEARCH_DOC_CAP_WHY}
              </p>
            </details>
          </div>
        ) : (
          <div className="max-w-[70ch] rounded-lg border border-hairline bg-paper-2 px-4 py-3">
            <p className="text-[13px] leading-[1.5] text-foreground">
              About {preview.documentCount}{" "}
              {preview.documentCount === 1 ? "document" : "documents"} across
              your selected collections. Give it a moment once you start,
              we&rsquo;ll confirm the exact count as we go.
            </p>
            <p className="mt-1 text-[11.5px] leading-[1.5] text-caption">
              Roughly {preview.estMinutesLow}&ndash;{preview.estMinutesHigh}{" "}
              minutes.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
