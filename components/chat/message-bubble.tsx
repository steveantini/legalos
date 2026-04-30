"use client";

import { DownloadMessageButton } from "./download-message-button";
import { MarkdownRenderer } from "./markdown-renderer";

import type { ChatCitation } from "@/lib/chat/sse-parser";

export type ChatMessage = {
  /** Server-issued UUID once known; transient client id otherwise. */
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /**
   * Web-search citations attached to this assistant message, if any.
   * Populated from the SSE citations event before the done event fires.
   * Does not persist across page reloads — when conversation-resumption
   * lands, citations move to a messages.citations column.
   */
  citations?: ChatCitation[];
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
  // Gate the download button on a server-issued message id. Streaming
  // turns use a "tmp-..." placeholder until the SSE done event finalizes
  // the id; exporting a half-streamed message would produce truncated
  // .docx output and a junk formatted_outputs row. Once the temp prefix
  // is gone the message has fully landed in the DB and is exportable.
  const isExportable = !message.id.startsWith("tmp-");
  return (
    <li
      role="article"
      className="group/message flex items-start justify-start gap-2"
    >
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm text-card-foreground">
        <MarkdownRenderer content={message.content} />
        {message.citations && message.citations.length > 0 ? (
          <div className="mt-3 border-t border-border pt-2 text-xs">
            <p className="font-medium text-muted-foreground">Sources</p>
            <ol className="mt-1 list-inside list-decimal space-y-0.5">
              {message.citations.map((c, i) => (
                <li key={`${c.url}-${i}`}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline"
                  >
                    {c.title || c.url}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
      {isExportable ? <DownloadMessageButton messageId={message.id} /> : null}
    </li>
  );
}
