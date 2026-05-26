import "server-only";

import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { marked, type Token, type Tokens } from "marked";

import type { ChatSource } from "@/lib/chat/sse-parser";

/**
 * Markdown → Word (.docx) renderer for per-message exports
 * (architecture §4 / Session 8k; extended in the Word export arc, Stage 2).
 *
 * Document shape:
 *   - Title block: agent name as H1, export date as a caption-style subtitle.
 *   - Body: marked token walk (headings, paragraphs, bold/italic/inline-code,
 *     ordered + unordered lists). Citation markers in the body
 *     (`<sup data-source-id="src_xxx"></sup>`) become Word footnotes whose
 *     number follows first-appearance order in the body.
 *   - Sources section: H2 "Sources" + a Word-native numbered list of the
 *     cited sources, each a hyperlink to its URL, in footnote order. Only
 *     rendered when at least one source was actually cited in the body.
 *   - Page footer: "Exported from {productName} on {Month DD, YYYY}".
 *
 * Body feature set (per Decision 4 / 8k plan):
 *   - Headings (H1–H6 mapped 1:1 to docx HeadingLevel)
 *   - Paragraphs
 *   - Bold (**), italic (*)
 *   - Inline code (Courier New)
 *   - Unordered + ordered lists (single-level, nested falls through)
 *
 * Out of scope (graceful fallback to plain text):
 *   - Tables, code blocks, blockquotes, images, non-citation HTML
 *   - Hyperlinks in the body: link tokens render as their visible text only;
 *     the URL is dropped per Decision 3. (Source URLs survive via footnotes
 *     and the Sources section.)
 *
 * The renderer never throws on unknown token types — it falls through to a
 * plain TextRun with the token's raw source. Models occasionally emit
 * edge-case markdown that strict parsers reject; this approach preserves the
 * user's content without bricking the export.
 */

const MONOSPACE_FONT = "Courier New";

/** Caption-style runs (date subtitle, page footer): smaller, muted gray. */
const CAPTION_COLOR = "6B7280";
const SUBTITLE_SIZE_HALF_POINTS = 18; // 9pt
const FOOTER_SIZE_HALF_POINTS = 16; // 8pt

const HEADING_LEVELS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/** Numbering reference for markdown ordered lists in the body. */
const ORDERED_LIST_REF = "ordered-list";
/** Numbering reference for the trailing Sources bibliography list. */
const SOURCES_NUMBERING_REF = "sources-numbering";

/**
 * Citation markers in `messages.content`. The chat route emits the paired
 * form `<sup data-source-id="src_xxx"></sup>` (app/api/chat/route.ts); older
 * persisted messages carry the self-closing form `<sup ... />`. marked's
 * inline lexer is inconsistent about how it tokenizes these:
 *   - In paragraph/heading/strong/em context it splits the paired form into
 *     two separate `html` tokens (`<sup ...>` then `</sup>`).
 *   - In list-item context it leaves the whole marker as a substring inside
 *     a flat `text` token.
 * We therefore match both an html-token form (open tag, self-close, or a
 * full marker in one token) and a substring form (split a text node on the
 * global regex). A `</sup>` closing token on its own renders nothing.
 */
const SUP_FULL_OR_SELF_CLOSE_RE =
  /^<sup\s+data-source-id="([^"]*)"\s*(?:\/>|>\s*<\/sup>)$/i;
const SUP_OPEN_RE = /^<sup\s+data-source-id="([^"]*)"\s*>$/i;
const SUP_CLOSE_RE = /^<\/sup>$/i;
const CITATION_MARKER_GLOBAL_SOURCE =
  '<sup\\s+data-source-id="([^"]*)"\\s*(?:\\/>|>\\s*<\\/sup>)';

/**
 * Walk-time citation state. Footnote indices are assigned lazily the first
 * time each source id appears in the body, so the numbers the reader sees
 * follow body order (not the order of the `sources` array). `orderedIds`
 * preserves that assignment order for the footnote definitions and the
 * Sources section.
 */
type CitationContext = {
  bySourceId: Map<string, ChatSource>;
  idToIndex: Map<string, number>;
  orderedIds: string[];
};

/**
 * Footnote reference for a cited source. Returns null (renders nothing) when
 * the marker points at a source id not present in `messages.sources` — a
 * dangling marker should not produce an empty footnote.
 */
function citationRefFor(
  ctx: CitationContext,
  sourceId: string,
): FootnoteReferenceRun | null {
  if (!ctx.bySourceId.has(sourceId)) return null;
  let index = ctx.idToIndex.get(sourceId);
  if (index === undefined) {
    index = ctx.orderedIds.length + 1;
    ctx.idToIndex.set(sourceId, index);
    ctx.orderedIds.push(sourceId);
  }
  return new FootnoteReferenceRun(index);
}

type InlineChild = TextRun | FootnoteReferenceRun;

/**
 * Inline formatting accumulated as we recurse into nested phrasing
 * tokens (strong wrapping em, etc).
 */
type InlineFormat = {
  bold?: boolean;
  italics?: boolean;
  monospace?: boolean;
};

/**
 * Split a plain text node on embedded citation markers, interleaving text
 * runs with footnote references. Used for the list-item shape where marked
 * leaves the marker inside a text token's text.
 */
function splitTextWithCitations(
  text: string,
  format: InlineFormat,
  ctx: CitationContext,
): InlineChild[] {
  const re = new RegExp(CITATION_MARKER_GLOBAL_SOURCE, "gi");
  const out: InlineChild[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      out.push(makeRun(text.slice(lastIndex, index), format));
    }
    const ref = citationRefFor(ctx, match[1]);
    if (ref) out.push(ref);
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push(makeRun(text.slice(lastIndex), format));
  }
  return out;
}

function inlineRuns(
  tokens: Token[] | undefined,
  ctx: CitationContext,
  format: InlineFormat = {},
): InlineChild[] {
  if (!tokens) return [];
  const runs: InlineChild[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "text": {
        // Marked nests inline tokens inside text tokens for some shapes.
        const t = token as Tokens.Text;
        if (Array.isArray(t.tokens) && t.tokens.length > 0) {
          runs.push(...inlineRuns(t.tokens, ctx, format));
        } else {
          runs.push(...splitTextWithCitations(t.text, format, ctx));
        }
        break;
      }
      case "strong":
        runs.push(
          ...inlineRuns((token as Tokens.Strong).tokens, ctx, {
            ...format,
            bold: true,
          }),
        );
        break;
      case "em":
        runs.push(
          ...inlineRuns((token as Tokens.Em).tokens, ctx, {
            ...format,
            italics: true,
          }),
        );
        break;
      case "codespan":
        runs.push(
          makeRun((token as Tokens.Codespan).text, {
            ...format,
            monospace: true,
          }),
        );
        break;
      case "link": {
        // Decision 3: drop the URL, render visible text only.
        const link = token as Tokens.Link;
        runs.push(...inlineRuns(link.tokens, ctx, format));
        break;
      }
      case "br":
        runs.push(new TextRun({ text: "", break: 1 }));
        break;
      case "del":
        runs.push(...inlineRuns((token as Tokens.Del).tokens, ctx, format));
        break;
      case "html": {
        // Citation markers arrive here when marked inline-lexes the body
        // (paragraph/heading/strong/em context).
        const raw =
          (token as { text?: string }).text ??
          (token as { raw?: string }).raw ??
          "";
        const supMatch =
          raw.match(SUP_FULL_OR_SELF_CLOSE_RE) ?? raw.match(SUP_OPEN_RE);
        if (supMatch) {
          const ref = citationRefFor(ctx, supMatch[1]);
          if (ref) runs.push(ref);
          break;
        }
        if (SUP_CLOSE_RE.test(raw)) break; // closing tag — already handled
        // Other inline HTML: graceful fallback to its raw source text.
        if (raw) runs.push(makeRun(raw, format));
        break;
      }
      default: {
        // Graceful fallback: render the raw source text.
        const raw = (token as { text?: string; raw?: string }).text
          ?? (token as { raw?: string }).raw
          ?? "";
        if (raw) runs.push(makeRun(raw, format));
      }
    }
  }
  return runs;
}

function makeRun(text: string, format: InlineFormat): TextRun {
  return new TextRun({
    text,
    bold: format.bold,
    italics: format.italics,
    font: format.monospace ? MONOSPACE_FONT : undefined,
  });
}

/**
 * Render a single block-level token (or list item) to one or more
 * Paragraphs. Lists return one paragraph per item with the appropriate
 * bullet/numbering applied.
 */
function blockToParagraphs(token: Token, ctx: CitationContext): Paragraph[] {
  switch (token.type) {
    case "heading": {
      const h = token as Tokens.Heading;
      return [
        new Paragraph({
          heading: HEADING_LEVELS[h.depth] ?? HeadingLevel.HEADING_3,
          children: inlineRuns(h.tokens, ctx),
        }),
      ];
    }
    case "paragraph": {
      const p = token as Tokens.Paragraph;
      return [new Paragraph({ children: inlineRuns(p.tokens, ctx) })];
    }
    case "list": {
      const list = token as Tokens.List;
      return list.items.flatMap((item: Tokens.ListItem) => {
        // Each list item can contain inline tokens (the visible bullet
        // text) and possibly nested block tokens (sub-lists, etc).
        // V1: render the inline content as the bullet's paragraph; nested
        // blocks fall through as additional non-bulleted paragraphs.
        const itemTokens = item.tokens ?? [];
        const inlineTokens: Token[] = [];
        const blockTokens: Token[] = [];
        for (const t of itemTokens) {
          if (t.type === "text" || t.type === "paragraph") {
            const inner =
              (t as Tokens.Text | Tokens.Paragraph).tokens ?? [
                { type: "text", raw: (t as { raw?: string }).raw ?? "", text: (t as { text?: string }).text ?? "" } as Token,
              ];
            inlineTokens.push(...inner);
          } else {
            blockTokens.push(t);
          }
        }
        const result: Paragraph[] = [
          list.ordered
            ? new Paragraph({
                children: inlineRuns(inlineTokens, ctx),
                numbering: { reference: ORDERED_LIST_REF, level: 0 },
              })
            : new Paragraph({
                children: inlineRuns(inlineTokens, ctx),
                bullet: { level: 0 },
              }),
        ];
        for (const blk of blockTokens) {
          result.push(...blockToParagraphs(blk, ctx));
        }
        return result;
      });
    }
    case "space":
      return [];
    case "hr":
      return [new Paragraph({ children: [] })];
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      // Graceful fallback: render the inline content as italic text,
      // no quote-block styling. Out of v1 scope (Decision 4).
      return bq.tokens.flatMap((t) => blockToParagraphs(t, ctx));
    }
    case "code":
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: (token as Tokens.Code).text,
              font: MONOSPACE_FONT,
            }),
          ],
        }),
      ];
    default: {
      // Tables, html, images, etc. fall through to plain text from
      // whatever raw source the token carries.
      const raw = (token as { raw?: string }).raw ?? "";
      if (!raw) return [];
      return [new Paragraph({ children: [new TextRun(raw)] })];
    }
  }
}

/** "May 26, 2026" in UTC. */
function formatExportDate(exportedAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(exportedAt);
}

/** Footnote body text: "Title (https://url)" or the URL alone if untitled. */
function footnoteText(source: ChatSource): string {
  const title = source.title?.trim();
  return title ? `${title} (${source.url})` : source.url;
}

function buildTitleBlock(agentName: string, exportedAt: Date): Paragraph[] {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: agentName })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: formatExportDate(exportedAt),
          size: SUBTITLE_SIZE_HALF_POINTS,
          color: CAPTION_COLOR,
        }),
      ],
    }),
  ];
}

/**
 * Trailing "Sources" section. `orderedIds` is the footnote-index order, so
 * the bibliography numbers match the in-body footnote numbers. Sources that
 * were never cited in the body are omitted — the body is canonical.
 */
function buildSourcesSection(
  sources: ChatSource[],
  orderedIds: string[],
  numbering: { reference: string },
): Paragraph[] {
  if (orderedIds.length === 0) return [];
  const bySourceId = new Map(sources.map((s) => [s.id, s]));
  const items: Paragraph[] = [];
  for (const id of orderedIds) {
    const source = bySourceId.get(id);
    if (!source) continue;
    const title = source.title?.trim();
    const visible = title && title.length > 0 ? source.title : source.url;
    items.push(
      new Paragraph({
        numbering: { reference: numbering.reference, level: 0 },
        children: [
          new ExternalHyperlink({
            link: source.url,
            children: [new TextRun({ text: visible, style: "Hyperlink" })],
          }),
        ],
      }),
    );
  }
  if (items.length === 0) return [];
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Sources" })],
    }),
    ...items,
  ];
}

function buildDocFooter(productName: string, exportedAt: Date): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: `Exported from ${productName} on ${formatExportDate(exportedAt)}`,
            size: FOOTER_SIZE_HALF_POINTS,
            color: CAPTION_COLOR,
          }),
        ],
      }),
    ],
  });
}

export type RenderMessageAsDocxInput = {
  markdown: string;
  agentName: string;
  sources: ChatSource[];
  exportedAt: Date;
  productName: string;
};

export async function renderMessageAsDocx(
  input: RenderMessageAsDocxInput,
): Promise<Buffer> {
  const { markdown, agentName, sources, exportedAt, productName } = input;

  const ctx: CitationContext = {
    bySourceId: new Map(sources.map((s) => [s.id, s])),
    idToIndex: new Map(),
    orderedIds: [],
  };

  // Body walk — assigns footnote indices lazily in first-appearance order.
  const tokens = marked.lexer(markdown);
  const bodyParagraphs: Paragraph[] = [];
  for (const token of tokens) {
    bodyParagraphs.push(...blockToParagraphs(token, ctx));
  }

  // Footnote definitions keyed by the same 1-based index the body refs use.
  const footnotes: Record<string, { children: Paragraph[] }> = {};
  ctx.orderedIds.forEach((id, i) => {
    const source = ctx.bySourceId.get(id);
    if (!source) return;
    footnotes[String(i + 1)] = {
      children: [
        new Paragraph({ children: [new TextRun({ text: footnoteText(source) })] }),
      ],
    };
  });

  const sourcesSection = buildSourcesSection(sources, ctx.orderedIds, {
    reference: SOURCES_NUMBERING_REF,
  });

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: "left",
            },
          ],
        },
        {
          reference: SOURCES_NUMBERING_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: "left",
            },
          ],
        },
      ],
    },
    footnotes,
    sections: [
      {
        footers: { default: buildDocFooter(productName, exportedAt) },
        children: [
          ...buildTitleBlock(agentName, exportedAt),
          ...bodyParagraphs,
          ...sourcesSection,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
