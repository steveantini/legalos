"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useRef } from "react";

import { ChatEmptyState } from "./chat-empty-state";
import { MessageBubble, type ChatMessage } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";

interface MessageListProps {
  agentName: string;
  agentDescription: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  /** True when streaming has started but no assistant token has arrived yet. */
  isWaitingForFirstToken: boolean;
  /**
   * Non-null when the model is using a server-side tool (e.g., web
   * search). Renders an inline status row in place of the typing
   * indicator with the given label. Cleared on tool_use_end or stream
   * completion.
   */
  toolUseLabel: string | null;
}

/**
 * Renders the empty state (no messages yet) OR the message bubbles plus a
 * typing indicator while waiting for the first token.
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
 */
export function MessageList({
  agentName,
  agentDescription,
  messages,
  isStreaming,
  isWaitingForFirstToken,
  toolUseLabel,
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
  }, [messages, isWaitingForFirstToken, toolUseLabel]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scrollbar-stable min-h-0 flex-1 overflow-y-auto"
      >
        <ChatEmptyState
          agentName={agentName}
          agentDescription={agentDescription}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="scrollbar-stable min-h-0 flex-1 overflow-y-auto"
      aria-live="polite"
      aria-busy={isStreaming}
    >
      <ul className="mx-auto flex w-full max-w-4xl flex-col gap-7 py-6">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {toolUseLabel ? (
          <li className="flex items-center gap-2 text-sm italic text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            {toolUseLabel}
          </li>
        ) : isWaitingForFirstToken ? (
          <li>
            <TypingIndicator />
          </li>
        ) : null}
      </ul>
    </div>
  );
}
