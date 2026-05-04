"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders assistant message content as sanitized markdown using the
 * Aperture chat type ramp from chat-aperture-spec.md §2.3.
 *
 * Pipeline: react-markdown parses → remark-gfm adds GitHub flavor (tables,
 * strikethrough, task lists, autolinks) → rehype-sanitize strips dangerous
 * HTML at the AST level using the GitHub-style defaultSchema (drops
 * <script>, <style>, on* handlers, javascript: URIs, dangerous attrs) →
 * react-markdown renders to React elements.
 *
 * Two layers of XSS defense:
 *   1. AST-level sanitization (rehype-sanitize) ensures untrusted HTML
 *      never reaches the renderer.
 *   2. react-markdown produces real React elements rather than injecting
 *      raw HTML strings, so JSX text-node auto-escaping covers anything
 *      sanitization might miss.
 *
 * Per CLAUDE.md "Security Non-Negotiables": all model output is treated
 * as untrusted and sanitized before render. Per "What Not to Do": no
 * client-rendered markdown without sanitization.
 *
 * Type-ramp implementation note (Session 15): the legacy version used
 * `prose prose-sm` from @tailwindcss/typography. Spec §2.3 review
 * checklist explicitly says "not the default @tailwind/typography
 * defaults". Switched to per-element overrides via ReactMarkdown's
 * `components` prop. Pinned values from the spec table — every size,
 * weight, line-height, and tracking value is intentional. Colors use
 * Aperture tokens (text-foreground, text-caption, text-primary,
 * bg-card-divider, bg-chat-code, text-chat-code-fg, border-border).
 *
 * Spacing: top margins (`mt-4` paragraphs, `mt-6`/`mt-8` headings)
 * provide hierarchy. Paragraphs use `[&:not(:first-child)]:mt-4` so the
 * first paragraph in a message doesn't have a leading gap.
 *
 * h1 isn't in the spec's type ramp (the page-level h1 is the agent
 * header). Defensive fallback: render h1 with h2's styling.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="max-w-3xl text-chat-prose-fg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, defaultSchema]]}
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
            // Inline code (no language hint) vs block code (language-…
            // className applied by remark-gfm / mdast). The block-code
            // path renders the raw <code> here; the surrounding <pre>
            // (handled by the pre override below) wraps it with the
            // dark-surface treatment.
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
