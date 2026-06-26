"use client";

import { useId, useState } from "react";

import { CollectionScopeCard } from "@/components/knowledge/collection-scope-card";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import {
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
  type QueryableCollection,
} from "@/lib/knowledge/structured-query-shared";

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

      {/* Scope (Zone 1): the single collection and what it tracks, as ONE card.
          The tracked-field pills live inside the card (the merge), so there is
          no separate "tracks these fields" box. A single-column stack gives the
          pills room and matches the Research scope treatment. */}
      <CollapsibleSection
        title="Collection"
        sectionKey="structured-query-scope"
        defaultCollapsed={false}
        description={<span aria-live="polite">{scopeSummary}</span>}
      >
        <div className="flex flex-col gap-2">
          {collections.map((collection) => (
            <CollectionScopeCard
              key={collection.id}
              name={collection.name}
              documentCount={collection.documentCount}
              provenance={collection.provenance}
              fields={collection.attributes.map((attribute) => attribute.label)}
              selected={selectedId === collection.id}
              onSelect={() => setSelectedId(collection.id)}
              inputType="radio"
              inputName="structured-query-collection"
            />
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}
