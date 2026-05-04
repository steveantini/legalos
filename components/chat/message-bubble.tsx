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
 * Single chat turn. Session-15-polish iteration of spec §1.4: the
 * 64px speaker-label gutter is removed; the tinted-card-vs-bare-prose
 * contrast carries the speaker distinction on its own. Spec's mono-cap
 * `YOU` / `AGENT` labels read as redundant noise once the card/no-card
 * pattern is established, so we drop them.
 *
 * Branches:
 *
 * - "system":    centered, muted note. Used only for in-chat error notices.
 * - "user":      tinted card (`bg-chat-user-bubble-bg`, hairline border,
 *                10px radius, 12/16 padding) at max-w-3xl with
 *                `whitespace-pre-wrap break-words` so pasted contract
 *                formatting survives. Left-aligned (no mx-auto) — visually
 *                anchors against the prose column underneath.
 * - "assistant": bare prose at max-w-3xl (constraint applied inside
 *                MarkdownRenderer). DownloadMessageButton sits as a
 *                right-side flex sibling, hover-revealed via the
 *                `group/message` class.
 *
 * `min-w-0` on the flex-1 content column is load-bearing for the
 * assistant branch: flex children default to `min-width: auto`
 * (= min-content), so an unbreakable token (long URL, wide inline code)
 * would otherwise defeat the max-w-3xl cap and push the column wider
 * than the wrapper.
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
      <li role="article">
        <div className="mx-auto max-w-3xl rounded-[10px] border border-border bg-chat-user-bubble-bg px-4 py-3 text-[14.5px] leading-[1.55] text-foreground whitespace-pre-wrap break-words">
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
  //
  // Layout note: prose + citations + download button are wrapped in a
  // single `mx-auto max-w-3xl` flex container so the whole unit centers
  // within the li at the same centerline as the user card. Without this,
  // the download button as a flex sibling on the li itself would
  // asymmetrically narrow the prose's available width and offset the
  // prose centerline ~16px left of the user-card centerline. When
  // isExportable becomes true the prose's right edge pulls in by ~44px
  // (download mounts); acceptable since the button is opacity-0 until
  // hover and only mounts at a real state boundary (server-confirmed
  // message id).
  const isExportable = !message.id.startsWith("tmp-");
  return (
    <li role="article" className="group/message">
      <div className="mx-auto flex max-w-3xl items-start gap-2">
        <div className="min-w-0 flex-1">
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
      </div>
    </li>
  );
}
