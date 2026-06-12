import { DOC_PAGES } from "@/lib/marketing/documentation";

/**
 * Citation handling for the support assistant (D-160). The model is
 * instructed to end each grounded answer with one final line of the exact
 * form `Sources: <slug>, <slug>`. This module strips that line from the
 * answer body and resolves the slugs against the REAL published guides, so
 * a citation is always a live /documentation/<slug> link and a hallucinated
 * slug simply drops (never a dead link, the help-links discipline).
 */

export type SupportCitation = {
  slug: string;
  title: string;
  href: string;
};

const SOURCES_LINE = /\n?\s*Sources:\s*(.+)\s*$/i;

const GUIDES_BY_SLUG = new Map(
  DOC_PAGES.map((page) => [page.slug, page.title]),
);

export function splitAnswerAndCitations(raw: string): {
  answer: string;
  citations: SupportCitation[];
} {
  const match = raw.match(SOURCES_LINE);
  if (!match) {
    return { answer: raw.trim(), citations: [] };
  }

  const answer = raw.slice(0, match.index).trim();
  const seen = new Set<string>();
  const citations: SupportCitation[] = [];
  for (const part of match[1].split(",")) {
    const slug = part.trim().toLowerCase();
    const title = GUIDES_BY_SLUG.get(slug);
    if (!title || seen.has(slug)) continue;
    seen.add(slug);
    citations.push({ slug, title, href: `/documentation/${slug}` });
  }
  return { answer, citations };
}
