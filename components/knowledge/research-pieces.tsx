"use client";

import type {
  ResearchCitation,
  ResearchFindingView,
  ResearchRunStatus,
} from "@/lib/knowledge/research/shared";
import { cn } from "@/lib/utils";

/**
 * Shared display pieces for the Research surface (Knowledge arc Step 2):
 * the findings table, the answer block with citations and the honest basis
 * line, and the status vocabulary. Used by both the live run view and the
 * reopened-run detail, so the two cannot drift.
 */

export function statusLabel(status: ResearchRunStatus): string {
  switch (status) {
    case "planning":
      return "Planning";
    case "running":
      return "Reading documents";
    case "synthesizing":
      return "Writing the answer";
    case "completed":
      return "Completed";
    case "failed":
      return "Stopped";
    case "cancelled":
      return "Cancelled";
  }
}

const FINDING_STATUS_NOTE: Record<ResearchFindingView["status"], string | null> = {
  ok: null,
  fetch_failed: "Could not be read",
  read_incomplete: "Partially read",
};

/** The per-document findings table; fetch failures are visible rows. */
export function FindingsTable({
  findings,
}: {
  findings: ResearchFindingView[];
}) {
  if (findings.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <table className="w-full text-left text-[12.5px] leading-[1.5]">
        <thead>
          <tr className="border-b border-hairline bg-paper-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              Document
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Determination
            </th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => {
            const note = FINDING_STATUS_NOTE[finding.status];
            return (
              <tr
                key={finding.externalId}
                className="border-b border-hairline align-top last:border-b-0"
              >
                <td className="w-[38%] px-3 py-2.5">
                  {finding.sourceUrl ? (
                    <a
                      href={finding.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {finding.title}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">
                      {finding.title}
                    </span>
                  )}
                  <p className="mt-0.5 text-[11.5px] text-caption">
                    {finding.provenance}
                  </p>
                  <p className="mt-0.5">
                    <span
                      className={cn(
                        "text-[11.5px] font-medium",
                        finding.status !== "ok"
                          ? "text-warn-fg"
                          : finding.relevant
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {note ??
                        (finding.relevant === true
                          ? "Relevant"
                          : finding.relevant === false
                            ? "Not relevant"
                            : "No determination")}
                    </span>
                  </p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {finding.determination}
                  {finding.supportingExcerpt ? (
                    <p className="mt-1 border-l-2 border-hairline pl-2 text-[12px] italic text-caption">
                      “{finding.supportingExcerpt}”
                    </p>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The answer: prose, the honest basis line, the citations, the quiet
 * verify-against-sources framing (the product's draft-for-review register). */
export function AnswerBlock({
  answer,
  basis,
  citations,
}: {
  answer: string;
  basis: string | null;
  citations: ResearchCitation[];
}) {
  return (
    <div className="rounded-xl border border-hairline bg-paper-2 p-5">
      <div className="flex flex-col gap-3">
        {answer.split(/\n\s*\n/).map((paragraph, index) => (
          <p
            key={index}
            className="max-w-[75ch] text-[14px] leading-[1.6] text-foreground"
          >
            {paragraph}
          </p>
        ))}
      </div>

      {basis ? (
        <p className="mt-4 border-t border-hairline pt-3 text-[12.5px] leading-[1.5] text-muted-foreground">
          {basis}
        </p>
      ) : null}

      {citations.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Sources
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {citations.map((citation) => (
              <li key={citation.id} className="text-[12.5px] leading-[1.5]">
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  {citation.title}
                </a>{" "}
                <span className="text-caption">· {citation.domain}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-[12px] leading-[1.5] text-caption">
        This answer is a model&rsquo;s read of the documents above; verify
        against the cited sources before relying on it.
      </p>
    </div>
  );
}
