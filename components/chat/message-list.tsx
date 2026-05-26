"use client";

import { useEffect, useRef } from "react";

import { ChatErrorMessage } from "./chat-error-message";
import { MessageBubble, type ChatMessage } from "./message-bubble";
import { ThinkingGlyph } from "./thinking-glyph";
import { TypingIndicator } from "./typing-indicator";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** True when streaming has started but no assistant token has arrived yet. */
  isWaitingForFirstToken: boolean;
  /**
   * Locked copy for the stream-interrupted banner-message variant
   * (Session 19, spec §2.9). Threaded as props rather than imported
   * from a shared constants module so the parent (ChatInterface)
   * remains the single source of truth for error copy.
   */
  streamErrorLead: string;
  streamErrorBody: string;
  /**
   * Click handler for an inline stream-interrupted banner-message.
   * Receives the banner-message id; ChatInterface walks the messages
   * array to find the partial assistant turn + user message before
   * re-firing.
   */
  onStreamErrorRetry: (bannerId: string) => void;
  /**
   * Click handler for an errored ToolTraceCard's retry button.
   * Receives the assistant message id that contains the errored
   * trace; ChatInterface walks the array to find the user before it
   * before re-firing.
   */
  onToolErrorRetry: (assistantId: string) => void;
}

/**
 * Renders the message bubbles plus a typing indicator while waiting for
 * the first token.
 *
 * Auto-scroll behavior: pin the scroll container to the bottom on new
 * content unless the user has manually scrolled up. Threshold is ~80px from
 * the bottom — within that, we're "at the bottom" and keep the user pinned;
 * outside that, the user is reading history and we leave their scroll
 * position alone. Standard chat-app pattern.
 *
 * The container has aria-live="polite" so screen readers announce new
 * assistant content without interrupting earlier reading; aria-busy reflects
 * isStreaming so assistive tech can convey "in progress".
 *
 * Centerline alignment (three-piece dependency):
 *
 *   1. Page main has `scrollbar-stable` + `overflow-hidden`. Reserves a
 *      ~15px gutter on its right edge — empty space that's never used
 *      (the page main never scrolls), but pulls the page main's content
 *      area in to ~881px.
 *   2. This scroll container has `scrollbar-stable`. Its own ~15px
 *      gutter is reserved on its right; the actual MessageList scrollbar
 *      lives in this gutter when content overflows. Without this, the
 *      scrollbar appearing/disappearing would jitter the message column
 *      width by 15px — the bug session 15 (D-030) fixed.
 *   3. This scroll container has `-mr-[15px]`. The negative right margin
 *      extends the container's outer 15px back into the page main's
 *      reserved gutter (overflow-hidden on page main clips at the
 *      padding-box edge, so the extension fits). Net: scroll container
 *      outer = full 896px instead of 881px; with its own scrollbar gutter
 *      reserving 15px, visible message content = 881px — matching the
 *      header / composer / banner content frame (also 881px since they
 *      live in page main's content area directly).
 *
 * All three pieces are load-bearing. Drop any one and alignment breaks:
 *
 *   - Without (1): page main has no gutter, header/composer center in
 *     896 (centerline 448) but messages center in 881 (centerline 440.5).
 *   - Without (2): scrollbar appearance jitters message content by 15px.
 *   - Without (3): scroll container narrows to 881, then its own gutter
 *     pulls visible content to 866 — messages center 7.5px left of the
 *     header/composer centerline.
 *
 * The 15px hardcoded value is a browser-default approximation (12–17px
 * actual depending on OS/browser). The 2–3px variance is invisible at
 * the chat surface scale; computing exact width at runtime adds JS hooks
 * for marginal correctness gain — explicitly not pursued.
 */
export function MessageList({
  messages,
  isStreaming,
  isWaitingForFirstToken,
  streamErrorLead,
  streamErrorBody,
  onStreamErrorRetry,
  onToolErrorRetry,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // Track whether the user is at-or-near the bottom of the scrollable
  // container. Updated on scroll; consulted on each render to decide whether
  // to auto-scroll.
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // `isStreaming` is in the deps so the bottom settles into view when
    // generation completes and the resting glyph appears below the response.
  }, [messages, isWaitingForFirstToken, isStreaming]);

  // After a completed assistant turn (not mid-generation), leave a static
  // resting glyph below the latest response — the concentric mark stays at
  // the most recent answer (Claude.ai's logo-at-latest-response pattern).
  // Hidden while streaming (the text + caret carry that state) and when the
  // last turn is a user message or an error banner.
  const lastMessage = messages[messages.length - 1];
  const showRestingGlyph = !isStreaming && lastMessage?.role === "assistant";

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="scrollbar-stable -mr-[15px] min-h-0 flex-1 overflow-y-auto"
      aria-live="polite"
      aria-busy={isStreaming}
    >
      <ul className="flex w-full flex-col gap-7 py-6">
        {messages.map((m, i) => {
          // Only the last assistant message gets the streaming caret —
          // never the user message (no caret on user prose), never a
          // mid-list assistant message (only the actively streaming
          // one). Cleared once isStreaming flips false on stream end.
          const isLast = i === messages.length - 1;
          const showCaret =
            isStreaming &&
            isLast &&
            m.role === "assistant" &&
            !isWaitingForFirstToken;

          // Synthetic banner-message: render the shared
          // <ChatErrorMessage> directly inside an <li>. mx-auto +
          // max-w-3xl matches the conversation column the rest of the
          // surface uses (user cards, prose, composer). Each
          // banner-message owns its own retry callback, closed over its
          // id so ChatInterface can locate the partial turn to discard.
          if (m.role === "error_banner") {
            return (
              <li key={m.id}>
                <div className="mx-auto max-w-3xl">
                  <ChatErrorMessage
                    lead={streamErrorLead}
                    body={streamErrorBody}
                    onRetry={() => onStreamErrorRetry(m.id)}
                  />
                </div>
              </li>
            );
          }

          // Tool-error retry: only assistant messages that carry at
          // least one errored tool call get an onRetry handler passed
          // down to their ToolTraceCard(s). Other messages pass
          // undefined so the trace-card branch hides the button.
          const hasToolError =
            m.role === "assistant" &&
            m.toolCalls.some((c) => c.status === "error");
          const toolRetry = hasToolError
            ? () => onToolErrorRetry(m.id)
            : undefined;

          return (
            <MessageBubble
              key={m.id}
              message={m}
              isStreaming={showCaret}
              onToolErrorRetry={toolRetry}
            />
          );
        })}
        {isWaitingForFirstToken ? (
          <li className="mx-auto w-full max-w-3xl">
            <TypingIndicator />
          </li>
        ) : showRestingGlyph ? (
          <li className="mx-auto w-full max-w-3xl">
            <ThinkingGlyph
              pulsing={false}
              className="animate-in fade-in duration-300 motion-reduce:animate-none"
            />
          </li>
        ) : null}
      </ul>
    </div>
  );
}
