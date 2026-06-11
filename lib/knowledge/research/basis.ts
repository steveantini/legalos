import type {
  ResearchCitation,
  ResearchFindingView,
} from "@/lib/knowledge/research/shared";

/**
 * Pure composition of the answer's HONEST BASIS and its citations (Knowledge
 * arc Step 2). The basis line states exactly what the answer rests on — how
 * many documents were read, across which collections, and what could not be
 * read — so nothing degrades silently. Citations are built in CODE from the
 * findings (never model-generated), in the established sources idiom
 * ({ id, title, url, domain }, messages.sources / 0014), pointing at the
 * repositories' own view links.
 */

export function composeBasisLine(input: {
  documentsRead: number;
  fetchFailed: number;
  readIncomplete: number;
  skippedUnsupported: number;
  collectionNames: string[];
}): string {
  const {
    documentsRead,
    fetchFailed,
    readIncomplete,
    skippedUnsupported,
    collectionNames,
  } = input;
  const parts: string[] = [];
  parts.push(
    `Read ${documentsRead} ${documentsRead === 1 ? "document" : "documents"} across ${collectionNames.join(", ")}.`,
  );
  if (fetchFailed > 0) {
    parts.push(
      `${fetchFailed} ${fetchFailed === 1 ? "document" : "documents"} could not be read.`,
    );
  }
  if (readIncomplete > 0) {
    parts.push(
      `${readIncomplete} ${readIncomplete === 1 ? "document was" : "documents were"} only partially readable.`,
    );
  }
  if (skippedUnsupported > 0) {
    parts.push(
      `${skippedUnsupported} ${skippedUnsupported === 1 ? "file" : "files"} of unsupported types ${skippedUnsupported === 1 ? "was" : "were"} not read.`,
    );
  }
  return parts.join(" ");
}

/** Citations: the relevant, successfully read findings that carry a link. */
export function buildCitations(
  findings: Pick<
    ResearchFindingView,
    "externalId" | "title" | "sourceUrl" | "relevant" | "status"
  >[],
): ResearchCitation[] {
  const citations: ResearchCitation[] = [];
  for (const finding of findings) {
    if (finding.relevant !== true) continue;
    if (finding.status === "fetch_failed") continue;
    if (!finding.sourceUrl) continue;
    let domain = "";
    try {
      domain = new URL(finding.sourceUrl).hostname;
    } catch {
      continue;
    }
    citations.push({
      id: finding.externalId,
      title: finding.title,
      url: finding.sourceUrl,
      domain,
    });
  }
  return citations;
}
