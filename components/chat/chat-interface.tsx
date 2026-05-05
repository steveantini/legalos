"use client";

import { useEffect, useRef, useState } from "react";

import { ChatErrorBanner } from "./chat-error-banner";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import type { ChatMessage } from "./message-bubble";

import {
  parseSseStream,
  type ChatStreamEvent,
  type ChatToolCall,
} from "@/lib/chat/sse-parser";

/**
 * localStorage key for the per-agent draft autosave (session 17b, spec §2.7).
 */
const DRAFT_STORAGE_KEY = (agentId: string) => `legalos.draft.${agentId}`;
const DRAFT_DEBOUNCE_MS = 200;

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
  agentModel: string;
  webSearchEnabled: boolean;
  isDeleted?: boolean;
  /**
   * Hydrated message list when `?c=<conversation_id>` is in the URL.
   * Empty array on first visit. Carries assistant-side sources +
   * toolCalls so trace cards and citation markers render the same
   * after a hard reload as they did mid-stream.
   */
  initialMessages?: ChatMessage[];
  /**
   * Conversation id matching `initialMessages`, or null on first visit.
   * On first send when null, the SSE meta event populates this and the
   * URL is updated via history.replaceState so a subsequent hard reload
   * preserves the conversation.
   */
  initialConversationId?: string | null;
}

/**
 * Top-level chat surface for a native agent. Owns the conversation state
 * for the lifetime of the page mount.
 *
 * Session 18b changes:
 *   - State seeds from initialMessages / initialConversationId props for
 *     the conversation reload path (?c=<conv_id>).
 *   - Replaces tool_use_start/end + end-of-stream citations with per-call
 *     tool_trace_* events and per-citation source_added events. The
 *     toolUseLabel ribbon is gone — trace cards are first-class blocks
 *     in the assistant message and serve as their own indicator.
 *   - Assistant message state carries content (with inline <sup> markers),
 *     sources[], and toolCalls[] — the message-bubble splices trace cards
 *     into the rendered block list at toolCalls[i].position.
 */
export function ChatInterface({
  agentId,
  agentName,
  agentDescription,
  agentModel,
  webSearchEnabled,
  isDeleted,
  initialMessages = [],
  initialConversationId = null,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Draft autosave: restore on mount
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

  // ---- Draft autosave: debounced write on change
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

  // ---- Esc-while-streaming → stop generation
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

  // ---- Unmount cleanup: abort any in-flight request
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function appendMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  /**
   * Mutate the last assistant message via a callback. Centralizes the
   * "find last, replace last" pattern used by every streamed update so
   * we don't litter the event switch with array-slice boilerplate.
   */
  function updateLastAssistant(
    update: (msg: ChatMessage) => ChatMessage,
  ) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), update(last)];
    });
  }

  async function handleSend() {
    const userMessage = draft.trim();
    if (!userMessage || isStreaming) return;

    setError(null);
    setDraft("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY(agentId));
    }
    setIsStreaming(true);
    setWaitingForFirstToken(true);

    const tempUserId = `tmp-user-${Date.now()}`;
    const tempAssistantId = `tmp-assistant-${Date.now()}`;
    appendMessage({
      id: tempUserId,
      role: "user",
      content: userMessage,
      sources: [],
      toolCalls: [],
    });
    appendMessage({
      id: tempAssistantId,
      role: "assistant",
      content: "",
      sources: [],
      toolCalls: [],
    });

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
        setError("Lost connection during the response. Try again.");
        appendMessage({
          id: `sys-${Date.now()}`,
          role: "system",
          content: "The assistant didn't finish responding.",
          sources: [],
          toolCalls: [],
        });
      }
    } finally {
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleStreamEvent(event: ChatStreamEvent) {
    switch (event.type) {
      case "meta": {
        if (!conversationId) {
          setConversationId(event.conversation_id);
          // Pin the conversation id to the URL so a hard reload restores
          // the same thread. replaceState (not pushState) — we don't
          // want a back-button entry between "fresh agent" and "agent
          // mid-conversation"; visiting the agent page later via the
          // unparameterized URL still gets a fresh conversation.
          if (typeof window !== "undefined") {
            const u = new URL(window.location.href);
            u.searchParams.set("c", event.conversation_id);
            window.history.replaceState({}, "", u.toString());
          }
        }
        break;
      }
      case "token": {
        if (waitingForFirstToken) setWaitingForFirstToken(false);
        updateLastAssistant((m) => ({ ...m, content: m.content + event.text }));
        break;
      }
      case "tool_trace_start": {
        if (waitingForFirstToken) setWaitingForFirstToken(false);
        const newCall: ChatToolCall = {
          id: event.id,
          name: event.name,
          input: event.input,
          output: null,
          status: "running",
          started_at: event.started_at,
          position: event.position,
        };
        updateLastAssistant((m) => ({
          ...m,
          toolCalls: [...m.toolCalls, newCall],
        }));
        break;
      }
      case "tool_trace_done": {
        updateLastAssistant((m) => ({
          ...m,
          toolCalls: m.toolCalls.map((c) =>
            c.id === event.id
              ? {
                  ...c,
                  status: "done" as const,
                  finished_at: event.finished_at,
                  output: event.output,
                }
              : c,
          ),
        }));
        break;
      }
      case "tool_trace_error": {
        updateLastAssistant((m) => ({
          ...m,
          toolCalls: m.toolCalls.map((c) =>
            c.id === event.id
              ? {
                  ...c,
                  status: "error" as const,
                  finished_at: event.finished_at,
                  error: event.error,
                }
              : c,
          ),
        }));
        break;
      }
      case "source_added": {
        updateLastAssistant((m) => ({
          ...m,
          sources: [
            ...m.sources,
            {
              id: event.id,
              title: event.title,
              url: event.url,
              domain: event.domain,
              fetched_at: event.fetched_at,
            },
          ],
        }));
        break;
      }
      case "done": {
        updateLastAssistant((m) => ({ ...m, id: event.assistant_message_id }));
        break;
      }
      case "error": {
        appendMessage({
          id: `sys-${Date.now()}`,
          role: "system",
          content:
            "The assistant didn't finish responding. Try again with the same prompt.",
          sources: [],
          toolCalls: [],
        });
        break;
      }
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
