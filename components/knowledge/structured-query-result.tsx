"use client";

import { GapSuggestionFlow } from "@/components/knowledge/gap-suggestion-flow";
import type {
  StructuredQueryCaveats,
  StructuredQueryGroup,
} from "@/lib/deterministic/structured-query";
import type {
  PresentedAnswer,
  PresentedGap,
  PresentedResult,
} from "@/lib/knowledge/structured-query-shared";

/**
 * The Structured Query answer presentation (commit 5). The EXACT count leads;
 * the interpreted query is shown in plain language (the transparency bridge);
 * the engine's honesty caveats ride one layer down but stay reachable (the same
 * "prose leads, detail beneath" pattern as the redline); and a sample of matched
 * documents carries the supporting citation per field, so the count is checkable,
 * not just asserted. A GAP is rendered honestly, naming what the collection DOES
 * track.
 */
export function StructuredQueryResultView({
  result,
  collectionId,
  onAdjust,
  onAskAnother,
}: {
  result: PresentedResult;
  /** The collection the question ran over, for the gap → suggest flow. */
  collectionId: string | null;
  onAdjust: () => void;
  onAskAnother: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-hairline bg-paper-2 p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Question
        </p>
        <p className="mt-1 max-w-[75ch] text-[15px] leading-[1.5] text-foreground">
          {result.question}
        </p>
      </div>

      {result.kind === "gap" ? (
        <GapBlock gap={result} collectionId={collectionId} />
      ) : (
        <AnswerBlock answer={result} />
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onAskAnother}
          className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
        >
          Ask another question
        </button>
        <button
          type="button"
          onClick={onAdjust}
          className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
        >
          Adjust this question
        </button>
      </div>
    </div>
  );
}

/**
 * The honest gap. PHASE-TWO SEAM: this is the exact surface that gains a "Want
 * me to start tracking <concept>?" offer when schema-grows-on-demand lands —
 * additive here (a button beneath the available-fields line), never a rewrite.
 */
function GapBlock({
  gap,
  collectionId,
}: {
  gap: PresentedGap;
  collectionId: string | null;
}) {
  return (
    <div className="max-w-[75ch] rounded-xl border border-hairline bg-paper-2 p-5">
      <p className="text-[15px] leading-[1.55] text-foreground">
        This collection doesn&rsquo;t track{" "}
        <span className="font-medium">{gap.missingConcept}</span>.
      </p>
      <p className="mt-2 text-[13.5px] leading-[1.5] text-muted-foreground">
        It currently tracks{" "}
        {gap.availableAttributes.map((attribute, index) => (
          <span key={attribute.key}>
            {index > 0 ? ", " : ""}
            <span className="text-foreground">{attribute.label}</span>
          </span>
        ))}
        . Try asking about one of those{collectionId ? ", or suggest tracking this one" : ""}.
      </p>
      {/* Phase two: offer to start tracking the missing field. Additive to the
          gap above; needs the collection the question ran over. */}
      {collectionId ? <GapSuggestionFlow gap={gap} collectionId={collectionId} /> : null}
    </div>
  );
}

function AnswerBlock({ answer }: { answer: PresentedAnswer }) {
  const { result } = answer;
  const grouped = result.groups !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* The exact answer leads. */}
      <div className="rounded-xl border border-hairline bg-paper-2 p-5">
        {grouped ? (
          <GroupTable
            groups={result.groups ?? []}
            total={result.total}
            matched={result.matched}
          />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] font-normal leading-none tracking-[-0.02em] text-foreground tabular-nums">
              {result.matched}
            </span>
            <span className="text-[14.5px] text-muted-foreground">
              of {result.total}{" "}
              {result.total === 1 ? "document" : "documents"}
            </span>
          </div>
        )}

        {/* The transparency bridge: what was asked of the engine, in plain
            language. */}
        <p className="mt-3 text-[12.5px] leading-[1.5] text-caption">
          <span className="text-muted-foreground">Interpreted as:</span>{" "}
          {answer.interpretedSummary}
        </p>
      </div>

      <StaleNotice answer={answer} />
      <Caveats caveats={result.caveats} />
      <Matches answer={answer} />
    </div>
  );
}

function GroupTable({
  groups,
  total,
  matched,
}: {
  groups: readonly StructuredQueryGroup[];
  total: number;
  matched: number;
}) {
  return (
    <div>
      <p className="text-[13px] text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{matched}</span>{" "}
        of {total} {total === 1 ? "document" : "documents"}, by value:
      </p>
      {groups.length === 0 ? (
        <p className="mt-2 text-[13px] text-caption">No documents to group.</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {groups.map((group, index) => (
            <li
              key={`${group.found ? group.value : "__not_found__"}-${index}`}
              className="flex items-baseline justify-between gap-4 py-1.5"
            >
              <span className="min-w-0 truncate text-[13.5px] text-foreground">
                {group.found ? group.value : <span className="text-muted-foreground">Not found</span>}
                {group.unverifiedCount > 0 ? (
                  <span className="ml-2 text-[11.5px] text-caption">
                    ({group.unverifiedCount} on an unverified quote)
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[13.5px] font-medium tabular-nums text-foreground">
                {group.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The collection's preparation honesty: never let an answer rest silently on
 * stale or absent extractions. */
function StaleNotice({ answer }: { answer: PresentedAnswer }) {
  const state = answer.preparationState;
  if (state === "ready") return null;

  let message: string | null = null;
  if (state === "needs_updating") {
    message =
      "Some documents have changed or the fields were edited since the last preparation, so this answer is based on the last prepared data.";
  } else if (state === "not_prepared") {
    message =
      "This collection hasn't been prepared yet, so there are no extracted values to count. An administrator can prepare it from Collections.";
  } else if (state === "no_documents") {
    message = "This collection has no synced documents yet, so there's nothing to count.";
  }
  if (!message) return null;

  return (
    <p className="max-w-[75ch] rounded-lg border border-warn-fg/30 bg-paper-2 px-4 py-3 text-[12.5px] leading-[1.5] text-warn-fg">
      {message}
    </p>
  );
}

/** The honesty caveats, reachable but one layer down. Only non-zero lines show;
 * if every caveat is zero, the count needs no qualification and nothing renders. */
function Caveats({ caveats }: { caveats: StructuredQueryCaveats }) {
  const lines: string[] = [];
  if (caveats.matchedOnUnverifiedCitation > 0) {
    lines.push(
      `${caveats.matchedOnUnverifiedCitation} of the matches rest on a quote we couldn't verify against the source.`,
    );
  }
  if (caveats.matchedOnTruncatedRead > 0) {
    lines.push(
      `${caveats.matchedOnTruncatedRead} were read from a document too long to scan in full.`,
    );
  }
  if (caveats.excludedNotFound > 0) {
    lines.push(
      `${caveats.excludedNotFound} documents were left out because the field wasn't found in them.`,
    );
  }
  if (caveats.excludedNotFoundTruncated > 0) {
    lines.push(
      `Of those, ${caveats.excludedNotFoundTruncated} came from a document only partially read, so the not-found isn't definitive.`,
    );
  }
  if (caveats.excludedUnparsedValue > 0) {
    lines.push(
      `${caveats.excludedUnparsedValue} had a value that couldn't be compared (it didn't fit the field's type).`,
    );
  }
  if (caveats.notExtracted > 0) {
    lines.push(
      `${caveats.notExtracted} documents haven't been prepared for this field yet.`,
    );
  }
  if (lines.length === 0) return null;

  return (
    <details className="group max-w-[75ch] rounded-lg border border-hairline bg-paper-2 px-4 py-3">
      <summary className="cursor-pointer list-none text-[12.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        How this count was reached
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {lines.map((line) => (
          <li key={line} className="text-[12.5px] leading-[1.5] text-caption">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The matched documents with their supporting citations, so the count is
 * checkable. Capped; the cap is surfaced honestly. */
function Matches({ answer }: { answer: PresentedAnswer }) {
  if (answer.matches.length === 0) return null;

  return (
    <section aria-labelledby="structured-query-matches">
      <h3
        id="structured-query-matches"
        className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
      >
        Matching documents
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {answer.matches.map((match) => (
          <li
            key={match.documentId}
            className="rounded-lg border border-hairline bg-paper-2 px-4 py-3"
          >
            <p className="truncate text-[13.5px] font-medium text-foreground">
              {match.title}
            </p>
            {match.values.length > 0 ? (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {match.values.map((value, index) => (
                  <li key={`${value.label}-${index}`} className="text-[12.5px] leading-[1.5]">
                    <span className="text-muted-foreground">{value.label}:</span>{" "}
                    <span className="text-foreground">{value.value}</span>
                    {value.excerpt ? (
                      <span className="mt-0.5 block border-l-2 border-hairline pl-2 text-caption">
                        &ldquo;{value.excerpt}&rdquo;{" "}
                        <span className={value.verified ? "text-caption" : "text-warn-fg"}>
                          {value.verified
                            ? "(verified against the source)"
                            : "(quote not verified against the source)"}
                        </span>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {answer.totalMatches > answer.shownMatches ? (
        <p className="mt-2 text-[12px] text-caption">
          Showing {answer.shownMatches} of {answer.totalMatches} matching
          documents.
        </p>
      ) : null}
    </section>
  );
}
