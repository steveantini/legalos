"use client";

import { MarkdownRenderer } from "./markdown-renderer";

export type ChatMessage = {
  /** Server-issued UUID once known; transient client id otherwise. */
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

interface MessageBubbleProps {
  message: ChatMessage;
}

/**
 * Single chat message. Branches on role:
 *
 * - "user":      right-aligned, primary tone. Plain text — user input must
 *                NOT be parsed as markdown (treat user content as literal,
 *                consistent with how the server side wraps it in <user_input>
 *                tags before sending to the model).
 * - "assistant": left-aligned, muted card tone. Sanitized markdown via
 *                MarkdownRenderer (parse → sanitize → render).
 * - "system":    centered, muted note. Used only for in-chat error notices
 *                (e.g., "The assistant didn't finish responding.").
 *
 * Rendered as <li role="article"> inside the <ul> message list — semantic,
 * screen-reader-navigable.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "system") {
    return (
      <li
        role="article"
        className="mx-auto max-w-2xl py-2 text-center text-xs italic text-muted-foreground"
      >
        {message.content}
      </li>
    );
  }

  if (message.role === "user") {
    return (
      <li role="article" className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </li>
    );
  }

  // assistant
  return (
    <li role="article" className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm text-card-foreground">
        <MarkdownRenderer content={message.content} />
      </div>
    </li>
  );
}
