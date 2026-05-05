"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, {
  defaultSchema,
  type Options as SanitizeOptions,
} from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { CitationMarker } from "./citation-marker";
import type { ChatSource } from "@/lib/chat/sse-parser";

interface MarkdownRendererProps {
  content: string;
  /**
   * Citation source records for the message. The `sup` component override
   * looks up `data-source-id` against this array to compute the rendered
   * superscript number. Optional for non-assistant or pre-citation
   * contexts; sup tags fall back to a `?` marker if no sources are passed.
   */
  sources?: ChatSource[];
}

/**
 * Sanitize schema extension: allow `<sup data-source-id="src_xxx">`.
 * The default GitHub schema already allows the `sup` tag, but does not
 * permit `data-source-id` — we whitelist exactly the one attribute we
 * inject. Everything else stays default (drops <script>, <style>, on*,
 * javascript: URIs, etc.) so XSS posture is unchanged.
 *
 * IMPORTANT: hast-util-sanitize represents `data-source-id` via the
 * camelCase property name `dataSourceId`. Bare-string allows the attr
 * regardless of value; a tuple `[name, value]` would only allow it
 * when the value matches — `["dataSourceId"]` (1-element tuple) is
 * interpreted as `[name, undefined]` and silently strips every
 * actual value, which is the bug Step C smoke caught.
 */
const citationSchema: SanitizeOptions = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    sup: [
      ...((defaultSchema.attributes && defaultSchema.attributes.sup) ?? []),
      "dataSourceId",
    ],
  },
};

/**
 * Normalize legacy self-closing `<sup ... />` markers (Step B emitted
 * this form, which HTML5 parsers treat as an unclosed open tag, causing
 * every subsequent token to nest INSIDE the sup as children — breaking
 * lists, citations, and tone of the rest of the message).
 *
 * The route now emits `<sup ...></sup>` directly, but messages persisted
 * before that fix carry the old shape; rewrite at render time so existing
 * conversations look right without a backfill migration.
 */
const LEGACY_SELF_CLOSING_SUP = /<sup\s+data-source-id="([^"]*)"\s*\/>/gi;

function normalizeCitationMarkers(content: string): string {
  return content.replace(
    LEGACY_SELF_CLOSING_SUP,
    (_match, id) => `<sup data-source-id="${id}"></sup>`,
  );
}

/**
 * Renders assistant message content as sanitized markdown using the
 * Aperture chat type ramp from chat-aperture-spec.md §2.3.
 *
 * Pipeline (Session 18b extension):
 *   react-markdown parses
 *     → remark-gfm adds GitHub flavor (tables, strikethrough, autolinks)
 *     → rehype-raw promotes inline HTML in markdown into HAST nodes so
 *       `<sup data-source-id="..." />` survives the AST round-trip
 *     → rehype-sanitize strips dangerous HTML at the AST level using a
 *       schema extending GitHub defaults to whitelist the sup data attr
 *     → react-markdown renders to React elements; the `sup` component
 *       override routes citation markers to <CitationMarker />
 *
 * Two layers of XSS defense remain intact:
 *   1. AST-level sanitization (rehype-sanitize) ensures untrusted HTML
 *      never reaches the renderer except for the explicitly whitelisted
 *      <sup data-source-id="..."> shape.
 *   2. react-markdown produces React elements rather than injecting raw
 *      HTML strings, so JSX text-node auto-escaping covers anything
 *      sanitization might miss.
 *
 * Per CLAUDE.md "Security Non-Negotiables": all model output is treated
 * as untrusted and sanitized before render. The sup whitelist preserves
 * that posture — the only structural addition is one self-closing tag
 * carrying one opaque data attribute.
 */
export function MarkdownRenderer({ content, sources }: MarkdownRendererProps) {
  const normalized = normalizeCitationMarkers(content);
  return (
    <div className="max-w-3xl text-chat-prose-fg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, citationSchema]]}
        components={{
          p: ({ children }) => (
            <p className="text-[14.5px] leading-[1.65] text-foreground [&:not(:first-child)]:mt-4">
              {children}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="mt-8 text-[18px] font-medium leading-[1.2] tracking-[-0.018em] text-foreground first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-8 text-[18px] font-medium leading-[1.2] tracking-[-0.018em] text-foreground first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-6 text-[15px] font-medium leading-[1.3] tracking-[-0.012em] text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-4 text-[14px] font-medium leading-[1.35] tracking-[-0.005em] text-foreground first:mt-0">
              {children}
            </h4>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-primary underline-offset-2 hover:underline focus-visible:underline"
            >
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const isBlock =
              typeof className === "string" && className.startsWith("language-");
            return isBlock ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="rounded-[3px] bg-card-divider px-[0.3em] py-[0.1em] font-mono text-[12.5px]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mt-4 overflow-x-auto rounded-[10px] bg-chat-code-bg px-4 py-3 font-mono text-[12.5px] leading-[1.55] text-chat-code-fg">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-4 border-l-2 border-border pl-4 text-[14.5px] italic leading-[1.6] text-foreground">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className="mt-4 space-y-1.5 [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.55em] [&_li]:before:h-[5px] [&_li]:before:w-[5px] [&_li]:before:rounded-full [&_li]:before:bg-primary">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-4 list-decimal space-y-1.5 pl-6 tabular-nums marker:text-caption">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-[14.5px] leading-[1.65] text-foreground">
              {children}
            </li>
          ),
          table: ({ children }) => (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px] leading-[1.45]">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.08em] text-caption">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-3 py-2 text-foreground">
              {children}
            </td>
          ),
          sup: (props) => {
            // hast stores `data-source-id` as `dataSourceId`. react-markdown
            // forwards properties via hast-util-to-jsx-runtime, which emits
            // data-* attrs back to their kebab-case form on the React prop
            // bag — but different versions / paths can leave the camelCase
            // form intact, so we check both for resilience.
            const bag = props as unknown as Record<string, string | undefined>;
            const sourceId =
              bag["data-source-id"] ?? bag.dataSourceId ?? undefined;
            if (!sourceId) {
              return <sup>{props.children}</sup>;
            }
            const idx = sources?.findIndex((s) => s.id === sourceId) ?? -1;
            if (idx < 0) {
              // Source-id pointed at a record we don't have in the array —
              // e.g. a stale message body referencing a removed source.
              // Render a plain "?" sup as a degraded fallback rather than
              // a broken anchor that scrolls nowhere.
              return (
                <sup className="text-[10.5px] text-muted-foreground">[?]</sup>
              );
            }
            const source = sources![idx];
            return (
              <CitationMarker
                index={idx + 1}
                sourceId={sourceId}
                title={source.title || source.url}
              />
            );
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
