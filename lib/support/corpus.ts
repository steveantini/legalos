import { isValidElement, type ReactNode } from "react";

import { DOC_PAGES } from "@/lib/marketing/documentation";

/**
 * The support assistant's grounding corpus (D-160): the ENTIRE public
 * documentation, rendered to plain text and carried in the model's context
 * on every call. Docs-in-context, deliberately not retrieval: the 13 guides
 * are small enough to fit wholly in the prompt, so grounding is total and
 * there is no retrieval layer to miss. The corpus is assembled once per
 * server instance (the guides are static data) and prompt-cached at the
 * API layer, so repeat calls pay the cache-read rate, not the full prompt.
 *
 * Each guide is wrapped in a <guide> tag carrying its real slug, so the
 * model can cite guides by slug and citations resolve to real
 * /documentation/<slug> pages (validated in citations.ts).
 */

/** Tags whose content reads as a block: separated by a newline in the text. */
const BLOCK_TAGS = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "div",
  "section",
  "table",
  "tr",
]);

/**
 * Walk a React node tree and collect its human-readable text. The doc
 * bodies are MarketingSection wrappers (whose heading lives in the `title`
 * prop, not in children) around plain HTML tags, so the walker needs only:
 * strings, arrays, and elements with `children` (+ the `title` prop as a
 * heading when present). List items get a leading dash so enumerations
 * survive the flattening.
 */
export function extractText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; title?: string };
    const heading =
      typeof props.title === "string" && props.title.length > 0
        ? `\n\n${props.title}\n`
        : "";
    const inner = extractText(props.children);
    if (typeof node.type === "string" && BLOCK_TAGS.has(node.type)) {
      const prefix = node.type === "li" ? "- " : "";
      return `${heading}${prefix}${inner}\n`;
    }
    return `${heading}${inner}`;
  }
  return "";
}

/** Collapse runs of blank lines and trim, so the corpus reads cleanly. */
function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The full documentation corpus as one plain-text block, every guide
 * wrapped in a slug-carrying tag. Assembled lazily and memoized: the
 * source data is static per deploy.
 */
let memoizedCorpus: string | null = null;

export function buildSupportCorpus(): string {
  if (memoizedCorpus !== null) return memoizedCorpus;
  const guides = DOC_PAGES.map((page) => {
    const body = tidy(extractText(page.body));
    return [
      `<guide slug="${page.slug}" title="${page.title}" audience="${page.audience}">`,
      page.lead,
      "",
      body,
      `</guide>`,
    ].join("\n");
  });
  memoizedCorpus = guides.join("\n\n");
  return memoizedCorpus;
}
