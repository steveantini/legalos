import type { RedlinePayload } from "@/lib/agents/pre-steps/document-compare";

/**
 * The visual redline for a Document Comparison turn (D-189): a single flowing,
 * UNIFIED INLINE view that walks the authoritative change set once and styles each
 * segment by type. It renders the SAME ComparisonResult the model's prose was built
 * from (carried on the message, never recomputed), so the explanation above and the
 * marks below cannot disagree.
 *
 * Purely presentational: it maps already-computed segments to styled spans and runs
 * NO diffing of its own. Accessibility rests on semantic <ins>/<del> elements plus
 * underline / strikethrough, so insertions and deletions are distinguishable
 * WITHOUT relying on color. Inline flow wraps naturally; pre-wrap preserves the
 * normalized whitespace and overflow-wrap breaks any long unbroken token.
 *
 * Side-by-side (two-column) alignment is a deliberate future enhancement: it is far
 * more layout and collapses on narrow widths, whereas this inline view is
 * width-robust. See DECISION_LOG D-189.
 */

const INS_CLASS =
  "rounded-[3px] bg-redline-add/12 px-0.5 text-redline-add underline decoration-redline-add/50 decoration-1 underline-offset-2";
const DEL_CLASS =
  "rounded-[3px] bg-redline-remove/12 px-0.5 text-redline-remove line-through decoration-redline-remove/60";

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function truncationNotice(truncated: RedlinePayload["truncated"]): string | null {
  if (truncated.old && truncated.new) {
    return "Both documents exceeded the size limit, so the redline may not cover the entire document.";
  }
  if (truncated.old) {
    return "The original document exceeded the size limit, so the redline may not cover all of it.";
  }
  if (truncated.new) {
    return "The revised document exceeded the size limit, so the redline may not cover all of it.";
  }
  return null;
}

export function DocumentRedline({ redline }: { redline: RedlinePayload }) {
  const { segments, summary, truncated, originalLabel, revisedLabel } = redline;
  const { insert, delete: del, replace } = summary.segmentCounts;
  const totalChanges = insert + del + replace;
  const notice = truncationNotice(truncated);

  return (
    <section
      aria-label="Visual redline"
      className="mt-3 overflow-hidden rounded-lg border border-hairline bg-muted/30"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-hairline px-3 py-2">
        <span className="text-xs font-medium text-foreground">Visual redline</span>
        <span className="text-[11px] text-caption">
          {summary.changed ? plural(totalChanges, "change") : "no changes"}
        </span>
      </div>

      <div className="px-3 py-2 text-[11px] text-caption">
        Comparing{" "}
        <span className="text-muted-foreground">{originalLabel}</span> (original)
        with <span className="text-muted-foreground">{revisedLabel}</span> (revised).
        {/* Legend: styled the same as real marks, but plain spans (not <ins>/<del>)
            so the semantic edit elements are reserved for actual changes in the
            body and a screen reader does not announce the legend as an edit. */}
        <span className="ml-2 inline-flex flex-wrap items-center gap-2">
          <span className={INS_CLASS}>added</span>
          <span className={DEL_CLASS}>removed</span>
        </span>
      </div>

      {notice ? (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">{notice}</p>
      ) : null}

      {summary.changed ? (
        <div className="max-h-[28rem] overflow-auto border-t border-hairline px-3 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {segments.map((seg, i) => {
              if (seg.type === "equal") {
                return <span key={i}>{seg.text}</span>;
              }
              if (seg.type === "insert") {
                return (
                  <ins key={i} className={INS_CLASS}>
                    {seg.text}
                  </ins>
                );
              }
              if (seg.type === "delete") {
                return (
                  <del key={i} className={DEL_CLASS}>
                    {seg.text}
                  </del>
                );
              }
              // replace: struck old text immediately followed by underlined new.
              return (
                <span key={i}>
                  <del className={DEL_CLASS}>{seg.oldText}</del>
                  <ins className={INS_CLASS}>{seg.newText}</ins>
                </span>
              );
            })}
          </p>
        </div>
      ) : (
        <p className="border-t border-hairline px-3 py-3 text-sm text-muted-foreground">
          No changes. The revised document is identical to the original.
        </p>
      )}
    </section>
  );
}
