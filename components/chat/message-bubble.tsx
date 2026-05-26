"use client";

import { CopyButton } from "./copy-button";
import { MessageActionsMenu } from "./message-actions-menu";
import { MarkdownRenderer } from "./markdown-renderer";
import { SourcesList } from "./sources-list";
import { ToolTraceCard } from "./tool-trace-card";

import type { ChatSource, ChatToolCall } from "@/lib/chat/sse-parser";

export type ChatMessage = {
  /** Server-issued UUID once known; transient client id otherwise. */
  id: string;
  /**
   * Roles:
   *   - `user` / `assistant`: normal turns, persisted to DB.
   *   - `system`: defensive support for `messages.role = system` rows
   *     from DB hydration (rare; not produced by client code today).
   *     Renders as a centered italic-muted line.
   *   - `error_banner`: synthetic, client-only marker that MessageList
   *     renders as a `<ChatErrorMessage>` rather than a bubble.
   *     Surfaces stream-interrupted and SSE-error states inline at the
   *     end of the partial assistant turn (Session 19, spec §2.9).
   *     `content` is unused for this role — copy is locked at the
   *     render call site.
   */
  role: "user" | "assistant" | "system" | "error_banner";
  /**
   * Assistant body markdown, possibly carrying inline
   * `<sup data-source-id="src_xxx" />` citation markers. User and system
   * roles use plain text; sup markers only appear on assistant messages.
   * Unused for `error_banner` (locked copy at the render site).
   */
  content: string;
  sources: ChatSource[];
  toolCalls: ChatToolCall[];
};

interface MessageBubbleProps {
  message: ChatMessage;
  /**
   * True when this is the last assistant turn AND the chat is currently
   * streaming. Drives the blinking caret at the end of the prose body
   * per chat-aperture-spec.md §2.6. Only ever true for at most one
   * message at a time.
   */
  isStreaming?: boolean;
  /**
   * Callback fired when the user clicks the retry button inside an
   * errored ToolTraceCard's expanded panel (Session 19, spec §2.9). The
   * parent (MessageList) computes a closure that knows which user
   * message to re-fire and which assistant message to discard, so this
   * bubble doesn't need to walk the messages array itself. Omitted when
   * no retry is available (e.g. on user / system messages, or assistant
   * messages with no errored tool calls). Threaded down to ToolTraceCard
   * as its `onRetry` prop.
   */
  onToolErrorRetry?: () => void;
}

type RenderBlock =
  | { kind: "text"; body: string }
  | { kind: "tool_trace_group"; toolCalls: ChatToolCall[] };

/**
 * Splice tool trace cards into the markdown body at their captured
 * positions, GROUPING adjacent same-name calls into a single group
 * block. "Adjacent" = the message.content slice between two calls
 * (or between a call's position and the next call's position) trims
 * to empty — i.e. there's no actual prose between them. Two web_search
 * calls with whitespace-only text between them group; a search →
 * sentence of prose → another search does not.
 *
 * Grouping is render-time only — the persisted tool_calls schema is
 * unchanged; each Anthropic tool_use_id still has its own row.
 *
 * The grouping is naturally stable across streaming updates because
 * buildBlocks() recomputes from scratch on every render: as new calls
 * land at the same position, they fold into the existing group rather
 * than creating new cards.
 */
function buildBlocks(message: ChatMessage): RenderBlock[] {
  const sorted = [...message.toolCalls].sort((a, b) => a.position - b.position);
  const blocks: RenderBlock[] = [];
  let cursor = 0;
  let i = 0;
  while (i < sorted.length) {
    const head = sorted[i];
    const safePos = Math.max(
      cursor,
      Math.min(head.position, message.content.length),
    );
    if (safePos > cursor) {
      blocks.push({ kind: "text", body: message.content.slice(cursor, safePos) });
    }
    // Look ahead: pull subsequent calls into this group as long as
    // (a) the same tool name and (b) the body slice between the previous
    // call's position and the next call's position is whitespace-only.
    const group: ChatToolCall[] = [head];
    let lastPos = safePos;
    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j];
      if (next.name !== head.name) break;
      const nextSafe = Math.max(
        lastPos,
        Math.min(next.position, message.content.length),
      );
      const between = message.content.slice(lastPos, nextSafe);
      if (between.trim() !== "") break;
      group.push(next);
      lastPos = nextSafe;
      j++;
    }
    blocks.push({ kind: "tool_trace_group", toolCalls: group });
    cursor = lastPos;
    i = j;
  }
  if (cursor < message.content.length) {
    blocks.push({ kind: "text", body: message.content.slice(cursor) });
  }
  return blocks;
}

/**
 * Find the last text block index, or -1 if there is none. Used to
 * decide where the streaming caret renders — we only show it after
 * the trailing text block, never after a trace card (a trace card
 * is its own indicator while running).
 */
function lastTextBlockIndex(blocks: RenderBlock[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind === "text") return i;
  }
  return -1;
}

export function MessageBubble({
  message,
  isStreaming,
  onToolErrorRetry,
}: MessageBubbleProps) {
  // error_banner messages are rendered by MessageList directly via
  // <ChatErrorMessage>; this branch is defensive — if one ever reaches
  // MessageBubble, render nothing rather than falling through into the
  // assistant rendering and producing a blank bubble.
  if (message.role === "error_banner") {
    return null;
  }

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
    // Animate only freshly-sent messages (tmp- ids) into the thread, not the
    // ones hydrated from history on load — otherwise every message in a
    // loaded conversation would slide in at once. Mirrors the `isHydrated`
    // id convention used in the assistant branch below.
    const isNew = message.id.startsWith("tmp-");
    return (
      <li
        role="article"
        className={
          isNew
            ? "animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
            : undefined
        }
      >
        <div className="mx-auto flex w-full max-w-3xl justify-end">
          <div className="max-w-full rounded-[10px] border border-border bg-chat-user-bubble-bg px-4 py-3 text-[14.5px] leading-[1.55] text-foreground whitespace-pre-wrap break-words">
            {message.content}
          </div>
        </div>
      </li>
    );
  }

  // assistant
  const isHydrated = !message.id.startsWith("tmp-");
  const isExportable = isHydrated;
  const blocks = buildBlocks(message);
  const lastTextIdx = lastTextBlockIndex(blocks);

  // Clean copy text: strip the inline citation <sup> markers so the clipboard
  // gets the prose, not the raw data-source-id tags. The Copy button shows
  // only on a completed turn with actual text — not the empty placeholder
  // during the waiting phase, and not while the caret is streaming.
  const copyText = message.content
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<sup\b[^>]*\/>/gi, "")
    .trim();
  const showCopy = !isStreaming && copyText.length > 0;

  return (
    <li role="article">
      <div className="mx-auto flex w-full max-w-3xl items-start gap-2">
        <div className="min-w-0 flex-1">
          {blocks.map((b, i) => {
            if (b.kind === "tool_trace_group") {
              return (
                <ToolTraceCard
                  key={`tcg-${b.toolCalls[0].id}-${b.toolCalls.length}`}
                  toolCalls={b.toolCalls}
                  messageIsHydrated={isHydrated}
                  onRetry={onToolErrorRetry}
                />
              );
            }
            const isLastText = i === lastTextIdx;
            return (
              <div key={`t-${i}`} className="relative">
                <MarkdownRenderer content={b.body} sources={message.sources} />
                {isStreaming && isLastText ? (
                  <span
                    aria-hidden
                    className="chat-caret-blink ml-[1px] inline-block h-[1.05em] w-[2px] translate-y-[0.18em] bg-muted-foreground"
                  />
                ) : null}
              </div>
            );
          })}
          {/* If we're streaming and there's no text block yet (only a
              trace card or nothing), render an empty-state caret at the
              end so the user sees an "alive" cursor between trace
              transitions. */}
          {isStreaming && lastTextIdx === -1 && message.content.length === 0 ? (
            <span
              aria-hidden
              className="chat-caret-blink ml-[1px] inline-block h-[1.05em] w-[2px] translate-y-[0.18em] bg-muted-foreground"
            />
          ) : null}
          <SourcesList sources={message.sources} />
          {showCopy ? (
            <div className="mt-2 flex items-center gap-1">
              <CopyButton text={copyText} />
              {isExportable ? (
                <MessageActionsMenu messageId={message.id} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
