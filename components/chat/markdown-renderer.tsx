"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders assistant message content as sanitized markdown.
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
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-muted prose-pre:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, defaultSchema]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
