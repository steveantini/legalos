import "server-only";

import {
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { marked, type Token, type Tokens } from "marked";

/**
 * Markdown → Word (.docx) renderer for per-message exports
 * (architecture §4 / Session 8k).
 *
 * V1 feature set (per Decision 4 / 8k plan):
 *   - Headings (H1–H6 mapped 1:1 to docx HeadingLevel)
 *   - Paragraphs
 *   - Bold (**), italic (*)
 *   - Inline code (Courier New)
 *   - Unordered + ordered lists (single-level, nested falls through)
 *
 * Out of scope (graceful fallback to plain text):
 *   - Tables, code blocks, blockquotes, images, HTML
 *   - Hyperlinks: link tokens render as their visible text only;
 *     the URL is dropped per Decision 3.
 *
 * The renderer never throws on unknown token types — it falls through
 * to a plain TextRun with the token's raw source. Models occasionally
 * emit edge-case markdown that strict parsers reject; this approach
 * preserves the user's content without bricking the export.
 */

const MONOSPACE_FONT = "Courier New";

const HEADING_LEVELS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/** Numbering reference name. Defined in the Document's numbering config. */
const ORDERED_LIST_REF = "ordered-list";

/**
 * Inline formatting accumulated as we recurse into nested phrasing
 * tokens (strong wrapping em, etc).
 */
type InlineFormat = {
  bold?: boolean;
  italics?: boolean;
  monospace?: boolean;
};

function inlineRuns(
  tokens: Token[] | undefined,
  format: InlineFormat = {},
): TextRun[] {
  if (!tokens) return [];
  const runs: TextRun[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "text": {
        // Marked nests inline tokens inside text tokens for some shapes.
        const t = token as Tokens.Text;
        if (Array.isArray(t.tokens) && t.tokens.length > 0) {
          runs.push(...inlineRuns(t.tokens, format));
        } else {
          runs.push(makeRun(t.text, format));
        }
        break;
      }
      case "strong":
        runs.push(
          ...inlineRuns((token as Tokens.Strong).tokens, {
            ...format,
            bold: true,
          }),
        );
        break;
      case "em":
        runs.push(
          ...inlineRuns((token as Tokens.Em).tokens, {
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
        runs.push(...inlineRuns(link.tokens, format));
        break;
      }
      case "br":
        runs.push(new TextRun({ text: "", break: 1 }));
        break;
      case "del":
        runs.push(...inlineRuns((token as Tokens.Del).tokens, format));
        break;
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
function blockToParagraphs(token: Token): Paragraph[] {
  switch (token.type) {
    case "heading": {
      const h = token as Tokens.Heading;
      return [
        new Paragraph({
          heading: HEADING_LEVELS[h.depth] ?? HeadingLevel.HEADING_3,
          children: inlineRuns(h.tokens),
        }),
      ];
    }
    case "paragraph": {
      const p = token as Tokens.Paragraph;
      return [new Paragraph({ children: inlineRuns(p.tokens) })];
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
                children: inlineRuns(inlineTokens),
                numbering: { reference: ORDERED_LIST_REF, level: 0 },
              })
            : new Paragraph({
                children: inlineRuns(inlineTokens),
                bullet: { level: 0 },
              }),
        ];
        for (const blk of blockTokens) {
          result.push(...blockToParagraphs(blk));
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
      return bq.tokens.flatMap((t) => blockToParagraphs(t));
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

export async function renderMessageAsDocx(markdown: string): Promise<Buffer> {
  const tokens = marked.lexer(markdown);
  const paragraphs: Paragraph[] = [];
  for (const token of tokens) {
    paragraphs.push(...blockToParagraphs(token));
  }
  // Empty messages still need at least one Paragraph or docx errors.
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun("")] }));
  }

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
      ],
    },
    sections: [{ children: paragraphs }],
  });

  return Packer.toBuffer(doc);
}
