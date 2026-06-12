import type { SegmentFinding } from "@/lib/knowledge/research/engine-core";

/**
 * Pure pieces of the inline research tool (Knowledge arc Step 3): scope-name
 * matching and the tool-result texts the model relays to the user. Every
 * non-answer outcome — no collections, unknown names, over the inline cap —
 * is an HONEST, well-formed tool result written to relay gracefully, never
 * an error. Unit-tested; no I/O.
 */

/** The inline document cap: an in-chat call must fit the chat request budget
 * (no segmenting inline), so reads + one or two classification calls must
 * stay well inside the loop's wall clock. 15 documents ≈ 15 reads plus at
 * most two batch calls — comfortably bounded. Corpus-scale questions belong
 * on the Research surface, and the over-cap result says so. */
export const RESEARCH_INLINE_DOCUMENT_CAP = 15;

/** Where corpus-scale questions belong; relayed verbatim in handoff results. */
export const RESEARCH_SURFACE_PATH = "/workspace/knowledge/research";

/** Match requested collection names against the user's visible collections
 * (case-insensitive, trimmed). Empty/omitted request = all visible. */
export function resolveRequestedCollections<T extends { name: string }>(
  requested: string[] | undefined,
  visible: T[],
): { matched: T[]; unknown: string[] } {
  if (!requested || requested.length === 0) {
    return { matched: visible, unknown: [] };
  }
  const byName = new Map(visible.map((c) => [c.name.trim().toLowerCase(), c]));
  const matched: T[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    const key = raw.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const collection = byName.get(key);
    if (collection) matched.push(collection);
    else unknown.push(raw.trim());
  }
  return { matched, unknown };
}

export function composeNoCollectionsResult(): string {
  return [
    "No document collections are visible to this user yet, so there is nothing to research.",
    "Collections are set up by administrators under Knowledge in legalOS. Suggest starting there.",
  ].join(" ");
}

export function composeUnknownCollectionsResult(
  unknown: string[],
  visibleNames: string[],
): string {
  const available =
    visibleNames.length > 0
      ? `The collections available to this user are: ${visibleNames.join(", ")}.`
      : "No collections are visible to this user.";
  return `No collection named ${unknown.map((n) => `"${n}"`).join(", ")} is visible to this user. ${available}`;
}

export function composeOverCapResult(
  documentCount: number,
  collectionNames: string[],
): string {
  return [
    `This scope (${collectionNames.join(", ")}) contains about ${documentCount} documents, which is beyond the inline limit of ${RESEARCH_INLINE_DOCUMENT_CAP} documents per in-chat research call.`,
    `Corpus-scale questions run on the Research page (${RESEARCH_SURFACE_PATH}), which reads the full scope with live progress, per-document findings, and citations.`,
    "Tell the user their question needs the Research page and link them to it.",
  ].join(" ");
}

export function composeScopeUnreadableResult(): string {
  return "The scope's repositories can't be read right now (a connection may need attention in Policy & access). Suggest checking with an administrator, or trying the Research page later.";
}

/**
 * The successful inline result: the basis, then per-document determinations
 * the model synthesizes its answer from. Sources ride alongside as real
 * chat citations; the result tells the model to cite by title.
 */
export function composeInlineFindingsResult(
  question: string,
  findings: SegmentFinding[],
  basis: string,
): string {
  const lines: string[] = [
    `Inline research over the user's collections for: ${question}`,
    `Basis: ${basis}`,
    "Per-document determinations:",
  ];
  for (const finding of findings) {
    const status =
      finding.status === "fetch_failed"
        ? "could not be read"
        : finding.relevant === true
          ? "relevant"
          : finding.relevant === false
            ? "not relevant"
            : "no determination";
    lines.push(
      `- ${JSON.stringify(finding.title)} (${status}${finding.status === "read_incomplete" ? "; partially read" : ""}): ${finding.determination}${finding.supportingExcerpt ? ` Excerpt: "${finding.supportingExcerpt}"` : ""}`,
    );
  }
  lines.push(
    "Answer the user's question from these determinations only; do not invent documents. Refer to documents by title — their source links are attached to this conversation as citations. State the basis (including anything unreadable) in your answer.",
  );
  return lines.join("\n");
}
