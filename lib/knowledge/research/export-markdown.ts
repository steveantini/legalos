import type {
  ResearchFindingView,
  ResearchRunView,
} from "@/lib/knowledge/research/shared";

/**
 * Pure composition of a research run's export document (Knowledge arc):
 * the markdown the EXISTING docx pipeline renders (lib/exports/docx.ts via
 * renderMessageAsDocx — headings, paragraphs, lists, links, emphasis; no
 * tables, which that renderer deliberately defers, so the findings render
 * as structured per-document blocks that read as a memo).
 *
 * The exported memo carries the full honest record: the question, the scope
 * with its real provenance (the standing transparency rule), when it ran,
 * the answer, the basis line, the verify-against-sources framing, the
 * citations as a numbered link list (the answer's citations are code-built
 * with no in-body markers, so the renderer's footnote machinery does not
 * apply), and the per-document findings — the evidence a reader of the memo
 * needs. A cancelled or failed run exports what exists with its status
 * stated plainly. Unit-tested; no I/O.
 */

const REVIEW_LINE =
  "This answer is a model's read of the documents listed below; verify against the cited sources before relying on it.";

function findingStatusLabel(finding: ResearchFindingView): string {
  if (finding.status === "fetch_failed") return "Could not be read";
  if (finding.status === "read_incomplete") {
    return finding.relevant === true
      ? "Relevant (partially read)"
      : finding.relevant === false
        ? "Not relevant (partially read)"
        : "Partially read";
  }
  if (finding.relevant === true) return "Relevant";
  if (finding.relevant === false) return "Not relevant";
  return "No determination";
}

/** A run's export, as markdown for the shared docx renderer + a filename base. */
export function composeResearchExportMarkdown(
  run: ResearchRunView,
  findings: ResearchFindingView[],
): { markdown: string; filenameBase: string } {
  const lines: string[] = [];

  lines.push("## Question", "", run.question, "");

  lines.push("## Scope", "");
  for (const collection of run.scope) {
    lines.push(`- **${collection.name}**`);
    for (const path of collection.provenance) {
      lines.push(`  - ${path}`);
    }
  }
  const ranOn = new Date(run.createdAt);
  if (!Number.isNaN(ranOn.getTime())) {
    lines.push(
      "",
      `Ran on ${ranOn.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}.`,
    );
  }
  lines.push("");

  // Honest status for anything short of completed: the memo says what it is.
  if (run.status === "cancelled") {
    lines.push(
      "**This run was cancelled.** The findings below are what it read before stopping.",
      "",
    );
  } else if (run.status === "failed") {
    lines.push(
      `**This run stopped before completing.**${run.failureReason ? ` ${run.failureReason}` : ""} The findings below are what it read.`,
      "",
    );
  }

  if (run.answer) {
    lines.push("## Answer", "", run.answer, "");
  }

  if (run.basis) {
    lines.push(`*${run.basis}*`, "");
  }
  lines.push(`*${REVIEW_LINE}*`, "");

  if (run.citations.length > 0) {
    lines.push("## Sources", "");
    run.citations.forEach((citation, index) => {
      lines.push(
        `${index + 1}. [${citation.title}](${citation.url}) · ${citation.domain}`,
      );
    });
    lines.push("");
  }

  if (findings.length > 0) {
    lines.push("## Findings", "");
    for (const finding of findings) {
      lines.push(`**${finding.title}** · ${findingStatusLabel(finding)}`, "");
      lines.push(`${finding.provenance}`, "");
      if (finding.determination) {
        lines.push(finding.determination, "");
      }
      if (finding.supportingExcerpt) {
        lines.push(`*"${finding.supportingExcerpt}"*`, "");
      }
      if (finding.sourceUrl) {
        lines.push(`[Open in repository](${finding.sourceUrl})`, "");
      }
    }
  }

  // Filename: a sanitized slice of the question (the route appends the date
  // stamp and extension, mirroring the message-export filename shape).
  const filenameBase =
    `Research - ${run.question}`
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)
      .trim() || "Research run";

  return { markdown: lines.join("\n"), filenameBase };
}
