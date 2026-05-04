"use client";

import { useEffect, useRef, useState } from "react";

import { ChatErrorBanner } from "./chat-error-banner";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import type { ChatMessage } from "./message-bubble";

import { parseSseStream, type ChatStreamEvent } from "@/lib/chat/sse-parser";

/**
 * localStorage key for the per-agent draft autosave (session 17b, spec §2.7).
 * One key per agent so switching between agents preserves both drafts
 * independently. Drafts are cleared on successful send and never on
 * abort — partial typing survives a Stop just like a network drop would.
 */
const DRAFT_STORAGE_KEY = (agentId: string) => `legalos.draft.${agentId}`;
const DRAFT_DEBOUNCE_MS = 200;

/**
 * Read `error.name === "AbortError"` from any thrown value. Used to
 * distinguish user-initiated stop (no banner, no system bubble — the
 * user knows) from network errors and unexpected stream failures.
 */
function isAbortError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  );
}

interface ChatInterfaceProps {
  agentId: string;
  agentName: string;
  agentDescription: string | null;
  /**
   * Composer-quick-config seed (session 17a). The chat composer's
   * <ModelPicker/> reads `agentModel` for its initial trigger label;
   * after the first selection it owns optimistic state and
   * `revalidatePath('/agents/<id>')` re-renders with the new value
   * on the next visit. <WebSearchIndicator/> is read-only — when
   * `webSearchEnabled` is true the composer renders the chip; when
   * false the slot is empty (toggling lives in the edit form).
   */
  agentModel: string;
  webSearchEnabled: boolean;
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
  agentModel,
  webSearchEnabled,
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
  /**
   * AbortController for the in-flight /api/chat fetch (session 17b).
   * Created fresh in handleSend, reset to null in finally. handleStop
   * aborts whichever controller is current; the catch blocks below
   * discriminate AbortError from real failures so user-initiated stops
   * land silently. The unmount cleanup at the bottom of this component
   * aborts any request that's in-flight when the user navigates away.
   */
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Debounce handle for the per-agent draft autosave (session 17b).
   * Cleared on every keystroke and on unmount; fires the localStorage
   * write 200ms after the last change.
   */
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Draft autosave: restore on mount (session 17b)
  // One-shot per agentId — re-fires if the user navigates between
  // agents, seeding the new agent's draft from its own localStorage key.
  // The cursor lands at end-of-text via rAF so the textarea has rendered
  // with the restored value before we set the selection range.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY(agentId));
    if (stored && stored.length > 0) {
      setDraft(stored);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.setSelectionRange(stored.length, stored.length);
      });
    }
  }, [agentId]);

  // ---- Draft autosave: debounced write on change (session 17b)
  // Clears any pending save on every keystroke, schedules a fresh write
  // 200ms after the last change. Empty drafts remove the key (so a
  // cleared composer doesn't leave a stale entry).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      if (draft.length === 0) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY(agentId));
      } else {
        window.localStorage.setItem(DRAFT_STORAGE_KEY(agentId), draft);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [draft, agentId]);

  // ---- Esc-while-streaming → stop generation (session 17b)
  // Window-level listener because <textarea disabled> doesn't dispatch
  // keyboard events per the WHATWG spec. Gated on isStreaming so plain
  // Esc doesn't hijack focus or other UI elements when no request is
  // in flight.
  useEffect(() => {
    if (!isStreaming) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        abortRef.current?.abort();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStreaming]);

  // ---- Unmount cleanup: abort any in-flight request (session 17b)
  // Empty deps so this only fires on unmount, not on re-render. Without
  // this, navigating away mid-stream leaves the fetch running until the
  // browser closes it; explicit abort is good hygiene and prevents dev-
  // server hangs on hot reload.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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
    // Belt-and-suspenders draft clear: the debounced effect would clear
    // it 200ms after the next render anyway (since draft is now ""), but
    // doing it inline removes the race where a fast user re-types before
    // the debounce flushes.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY(agentId));
    }
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

    // Fresh AbortController per request. handleStop reads from
    // abortRef.current; the finally block clears the ref so a stale
    // controller can't accidentally abort a future request.
    const controller = new AbortController();
    abortRef.current = controller;

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
        signal: controller.signal,
      });
    } catch (err) {
      if (!isAbortError(err)) {
        setError("Lost connection. Check your network and try again.");
      }
      // Drop the empty assistant placeholder either way. On abort, the
      // user knows they stopped — no banner, no system bubble.
      setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      abortRef.current = null;
      textareaRef.current?.focus();
      return;
    }

    if (!response.ok || !response.body) {
      const errorCode = await readErrorCode(response);
      setError(messageForErrorCode(errorCode));
      setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      abortRef.current = null;
      textareaRef.current?.focus();
      return;
    }

    try {
      for await (const event of parseSseStream(response)) {
        handleStreamEvent(event);
      }
    } catch (err) {
      if (!isAbortError(err)) {
        // Reading the stream itself threw (network drop mid-stream). Show
        // banner + system bubble.
        setError("Lost connection during the response. Try again.");
        appendMessage({
          id: `sys-${Date.now()}`,
          role: "system",
          content: "The assistant didn't finish responding.",
        });
      }
      // On AbortError: whatever tokens arrived before the abort stay in
      // the assistant message as-is. Per spec §2.6: no "[stopped by user]"
      // footer — the user knows. Note: the server-side Anthropic call
      // continues to completion (no signal threading to the SDK in this
      // session), so reloading the page will show the FULL assistant
      // message, not the partial. Cost-bleed pattern B is deferred.
    } finally {
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      // Defensive clear: any unmatched tool_use_start (server bug, dropped
      // SSE event, etc.) leaves the indicator stuck without this. The
      // adapter's message_stop fallback is the primary defense; this is
      // belt-and-suspenders.
      setToolUseLabel(null);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
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
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList
        agentName={agentName}
        agentDescription={agentDescription}
        messages={messages}
        isStreaming={isStreaming}
        isWaitingForFirstToken={waitingForFirstToken}
        toolUseLabel={toolUseLabel}
      />
      {error ? (
        <div className="mx-auto w-full max-w-3xl pb-2">
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
            className="mx-auto w-full max-w-3xl py-3 text-sm text-muted-foreground"
          >
            This agent has been deleted. Restore it from the trash to send new
            messages.
          </div>
        ) : (
          <MessageInput
            agentId={agentId}
            agentModel={agentModel}
            webSearchEnabled={webSearchEnabled}
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            onStop={handleStop}
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
