"use client";

import { useRef, useState } from "react";

import { ChatErrorBanner } from "./chat-error-banner";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import type { ChatMessage } from "./message-bubble";

import { parseSseStream, type ChatStreamEvent } from "@/lib/chat/sse-parser";

interface ChatInterfaceProps {
  agentId: string;
  agentName: string;
  agentDescription: string | null;
  /**
   * True when the agent has been soft-deleted (deleted_at IS NOT NULL).
   * The transcript stays accessible — conversations are immutable history
   * per architecture §3 — but the message input is replaced with a copy
   * banner pointing the user to the trash. Restoring the agent flips this
   * back to false on the next page load.
   */
  isDeleted?: boolean;
}

/**
 * Top-level chat surface for a native agent. Owns the conversation state
 * for the lifetime of the page mount:
 *
 *   - messages           : array of user / assistant / system bubbles
 *   - conversationId     : null on first send; populated from SSE meta
 *   - isStreaming        : true between user-send and SSE done/error
 *   - waitingForFirstToken : true between user-send and the first token
 *                            event arriving (drives the typing indicator)
 *   - error              : banner copy or null
 *
 * Refresh = new conversation per the Session 8b plan (no URL state, no
 * localStorage). Conversation listing and resumption are deferred sessions.
 *
 * Auth flows automatically via cookies on same-origin fetch — no manual
 * Authorization header. /api/chat reads the Supabase session cookie via
 * the user-scoped server client, so RLS is the last line of defense per
 * D-009 even though the route also checks dept access explicitly.
 */
export function ChatInterface({
  agentId,
  agentName,
  agentDescription,
  isDeleted,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);
  const [toolUseLabel, setToolUseLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function appendMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  function appendAssistantToken(text: string) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, content: last.content + text },
      ];
    });
  }

  function finalizeAssistantId(serverMessageId: string) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { ...last, id: serverMessageId }];
    });
  }

  function attachAssistantCitations(citations: ChatMessage["citations"]) {
    if (!citations || citations.length === 0) return;
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      const merged = [...(last.citations ?? []), ...citations];
      return [...prev.slice(0, -1), { ...last, citations: merged }];
    });
  }

  async function handleSend() {
    const userMessage = draft.trim();
    if (!userMessage || isStreaming) return;

    setError(null);
    setDraft("");
    setIsStreaming(true);
    setWaitingForFirstToken(true);

    // Append the user bubble and a placeholder assistant bubble. The
    // assistant placeholder starts with empty content; the typing indicator
    // (driven by waitingForFirstToken) covers the gap until the first token
    // arrives.
    const tempUserId = `tmp-user-${Date.now()}`;
    const tempAssistantId = `tmp-assistant-${Date.now()}`;
    appendMessage({ id: tempUserId, role: "user", content: userMessage });
    appendMessage({ id: tempAssistantId, role: "assistant", content: "" });

    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          conversation_id: conversationId,
          user_message: userMessage,
        }),
      });
    } catch {
      setError("Lost connection. Check your network and try again.");
      // Drop the empty assistant placeholder so we don't show a hanging
      // bubble.
      setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      textareaRef.current?.focus();
      return;
    }

    if (!response.ok || !response.body) {
      const errorCode = await readErrorCode(response);
      setError(messageForErrorCode(errorCode));
      setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      textareaRef.current?.focus();
      return;
    }

    try {
      for await (const event of parseSseStream(response)) {
        handleStreamEvent(event);
      }
    } catch {
      // Reading the stream itself threw (network drop mid-stream). Show
      // banner + system bubble.
      setError("Lost connection during the response. Try again.");
      appendMessage({
        id: `sys-${Date.now()}`,
        role: "system",
        content: "The assistant didn't finish responding.",
      });
    } finally {
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      // Defensive clear: any unmatched tool_use_start (server bug, dropped
      // SSE event, etc.) leaves the indicator stuck without this. The
      // adapter's message_stop fallback is the primary defense; this is
      // belt-and-suspenders.
      setToolUseLabel(null);
      textareaRef.current?.focus();
    }
  }

  function handleStreamEvent(event: ChatStreamEvent) {
    switch (event.type) {
      case "meta":
        // First message of a conversation populates conversationId; later
        // messages reuse it. user_message_id is informational; we don't
        // currently update the temp user id since nothing in 8b's UI
        // references it.
        if (!conversationId) setConversationId(event.conversation_id);
        break;
      case "token":
        if (waitingForFirstToken) setWaitingForFirstToken(false);
        appendAssistantToken(event.text);
        break;
      case "tool_use_start":
        setWaitingForFirstToken(false);
        setToolUseLabel(
          event.tool_name === "web_search" ? "Searching the web…" : "Using a tool…",
        );
        break;
      case "tool_use_end":
        setToolUseLabel(null);
        break;
      case "citations":
        attachAssistantCitations(event.citations);
        break;
      case "done":
        finalizeAssistantId(event.assistant_message_id);
        break;
      case "error":
        // Mid-stream error from the server: append a system bubble. No
        // banner here — the user has already seen partial assistant output
        // (or a typing indicator); the system bubble inline is the right
        // place to surface the failure.
        appendMessage({
          id: `sys-${Date.now()}`,
          role: "system",
          content: "The assistant didn't finish responding. Try again with the same prompt.",
        });
        break;
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <MessageList
        agentName={agentName}
        agentDescription={agentDescription}
        messages={messages}
        isStreaming={isStreaming}
        isWaitingForFirstToken={waitingForFirstToken}
        toolUseLabel={toolUseLabel}
      />
      {error ? (
        <div className="px-4 pb-2">
          <ChatErrorBanner
            message={error}
            onDismiss={() => setError(null)}
          />
        </div>
      ) : null}
      <div className="border-t border-border">
        {isDeleted ? (
          <div
            role="status"
            className="px-4 py-3 text-sm text-muted-foreground"
          >
            This agent has been deleted. Restore it from the trash to send new
            messages.
          </div>
        ) : (
          <MessageInput
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            disabled={isStreaming}
            focusRef={textareaRef}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Try to extract the discriminated-union error code from the JSON error
 * body. Falls back to `internal_error` if the body is missing or malformed,
 * which maps to a generic banner message.
 */
async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "internal_error";
  } catch {
    return "internal_error";
  }
}

function messageForErrorCode(code: string): string {
  switch (code) {
    case "unauthenticated":
      return "Your session expired. Sign in again to continue.";
    case "forbidden":
      return "You don't have access to this agent.";
    case "agent_not_found":
    case "agent_not_native":
      return "This agent isn't available right now.";
    case "invalid_input":
      return "Your message couldn't be sent. Try shortening it or removing special characters.";
    case "rate_limited":
      return "You're sending messages too quickly. Wait a moment, then try again.";
    case "upstream_error":
      return "The assistant couldn't respond. Try again in a moment.";
    case "internal_error":
    default:
      return "Something went wrong. Try again, and if it persists, contact your admin.";
  }
}
