"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import {
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
  type QueryableCollection,
} from "@/lib/knowledge/structured-query-shared";
import { cn } from "@/lib/utils";

/**
 * The Structured Query ask composer (commit 5), a deliberate SIBLING of the
 * Research composer: the QUESTION IS THE HERO, with scope as supporting cast.
 * Two things make it read as the EXACT tool rather than a second search box,
 * quietly and without a lecture: scope is a SINGLE collection (a structured
 * question is answered against one collection's defined fields), and the chosen
 * collection's queryable FIELDS are shown plainly beneath it, so a member sees
 * exactly what they can ask about before they ask. Precision is conveyed by
 * showing the fields and (after asking) the interpreted query and citations, not
 * by explaining determinism.
 */
export function StructuredQueryComposer({
  collections,
  pending,
  onRun,
  initialQuestion = "",
  initialCollectionId = null,
}: {
  collections: QueryableCollection[];
  pending: boolean;
  onRun: (question: string, collectionId: string) => void;
  initialQuestion?: string;
  initialCollectionId?: string | null;
}) {
  const questionId = useId();
  const [question, setQuestion] = useState(initialQuestion);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCollectionId ?? (collections.length === 1 ? collections[0].id : null),
  );
  // The composer initializes from props on mount; the surface unmounts it while
  // an answer is shown, so an "adjust" prefill is adopted on the next mount with
  // no effect needed (and no cascading-render setState-in-effect).

  const selected = collections.find((c) => c.id === selectedId) ?? null;
  const canRun =
    question.trim().length >= QUESTION_MIN_LENGTH && selected !== null && !pending;

  const scopeSummary = selected
    ? `Asking over ${selected.name}.`
    : "Choose one collection to ask about.";

  return (
    <div className="flex flex-col gap-6">
      {/* The hero question. */}
      <div className="rounded-xl border border-hairline bg-paper-2 transition-colors duration-release ease-release focus-within:border-hairline-strong motion-reduce:transition-none">
        <label htmlFor={questionId} className="sr-only">
          Your question
        </label>
        <textarea
          id={questionId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="How many agreements are NDAs?"
          rows={3}
          maxLength={QUESTION_MAX_LENGTH}
          className="block w-full resize-none bg-transparent px-5 pt-4 text-[16px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground/70 field-sizing-content min-h-[5.2em] max-h-[12em]"
        />
        <div className="flex items-center justify-end px-5 pb-3.5 pt-1">
          <Button
            type="button"
            onClick={() => canRun && selected && onRun(question.trim(), selected.id)}
            disabled={!canRun}
          >
            {pending ? "Asking…" : "Ask"}
          </Button>
        </div>
      </div>

      {/* Scope: a single collection, in the launchpad's collapsible idiom. */}
      <CollapsibleSection
        title="Collection"
        sectionKey="structured-query-scope"
        defaultCollapsed={false}
        description={<span aria-live="polite">{scopeSummary}</span>}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((collection) => {
            const checked = selectedId === collection.id;
            return (
              <label
                key={collection.id}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border px-3.5 py-2.5 transition-colors duration-hover ease-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring motion-reduce:transition-none",
                  checked
                    ? "border-hairline-strong bg-secondary"
                    : "border-hairline bg-paper-2 hover:bg-secondary",
                )}
              >
                <input
                  type="radio"
                  name="structured-query-collection"
                  className="sr-only"
                  checked={checked}
                  onChange={() => setSelectedId(collection.id)}
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

      {/* The exact-tool tell: the fields you can actually ask about. Quiet, not
          a lecture, and only once a collection is chosen. */}
      {selected ? (
        <div className="max-w-[70ch] rounded-lg border border-hairline bg-paper-2 px-4 py-3">
          <p className="text-[12px] font-medium text-muted-foreground">
            {selected.name} tracks these fields, and answers are exact and
            checkable:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selected.attributes.map((attribute) => (
              <span
                key={attribute.key}
                className="rounded-md border border-hairline bg-card px-2 py-0.5 text-[12px] text-foreground"
              >
                {attribute.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
