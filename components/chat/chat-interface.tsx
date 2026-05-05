"use client";

import { useEffect, useRef, useState } from "react";

import { AgentHeader } from "./agent-header";
import type { EmptyStateAttachment } from "./chat-empty-state";
import { ChatErrorMessage } from "./chat-error-message";
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

/**
 * Locked banner copy per chat-aperture-spec.md §2.9 + Session 19 prompt.
 * Lead is the bold first sentence; body is the explanation that follows.
 * Pinned as constants so the chat-error-message render call sites stay
 * declarative and the copy can't drift between the API-error and
 * stream-interrupted surfaces.
 */
const COPY_API_ERROR_LEAD = "Couldn't send.";
const COPY_API_ERROR_BODY = "Check your connection and try again.";
const COPY_STREAM_ERROR_LEAD = "Response interrupted.";
const COPY_STREAM_ERROR_BODY =
  "The assistant didn't finish — retry to get a complete answer.";

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
   * Owner-of-agent flag used by AgentHeader to gate the Edit link.
   * Session 19 moved AgentHeader into ChatInterface (so it can read
   * `messages.length === 0` for the empty-state header variant), so
   * this prop is now plumbed alongside the other header props rather
   * than landing on AgentHeader directly from the page.
   */
  isOwner: boolean;
  /**
   * `agents.updated_at` ISO timestamp. Surfaced by ChatEmptyState's
   * facts row (Session 19, spec §2.8) as "Last updated".
   */
  agentUpdatedAt: string;
  /**
   * Full attachment row set for the active agent (id + filename + size).
   * Empty array when the agent has no attachments. Consumed by
   * ChatEmptyState's file list and prop-drilled through MessageList.
   * AgentHeader's "N attached" chip uses agentAttachments.length.
   */
  agentAttachments: EmptyStateAttachment[];
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
 * Session 19 changes (spec §2.9 — error banners):
 *   - The single `error: string | null` state is replaced by
 *     `apiError: { lead, body } | null`. The banner-above-composer is
 *     now reserved for API-error-before-send only.
 *   - Mid-stream errors no longer set the banner state; they append a
 *     synthetic `role: "error_banner"` message at the end of the
 *     partial assistant turn. MessageList renders that role via
 *     `<ChatErrorMessage>` with a retry handler.
 *   - The send pipeline is factored into `streamRequest(userText,
 *     removeIds?)` so retries can re-fire without duplicating the
 *     handleSend setup. Three retry handlers (`handleApiRetry`,
 *     `handleStreamErrorRetry`, `handleToolErrorRetry`) all funnel
 *     through `streamRequest` with the right cleanup semantics.
 */
export function ChatInterface({
  agentId,
  agentName,
  agentDescription,
  agentModel,
  webSearchEnabled,
  isDeleted,
  isOwner,
  agentUpdatedAt,
  agentAttachments,
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
  /**
   * API-error-before-send banner. `null` when no banner is shown.
   * `retryUserText` carries the EXACT text that failed — captured at
   * send time, replayed by handleApiRetry. The composer's draft can
   * have drifted (the user is free to edit / type new text after the
   * failure); retry fires the original failed text, send fires
   * whatever's currently in the composer.
   */
  const [apiError, setApiError] = useState<{
    lead: string;
    body: string;
    retryUserText: string;
  } | null>(null);

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
   * Walks BACK from the end past any error_banner message — those
   * never carry assistant content, but a retry path can briefly leave
   * one at the end before the cleanup setMessages lands.
   */
  function updateLastAssistant(
    update: (msg: ChatMessage) => ChatMessage,
  ) {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant") {
          return [...prev.slice(0, i), update(prev[i]), ...prev.slice(i + 1)];
        }
        if (prev[i].role !== "error_banner") break;
      }
      return prev;
    });
  }

  /**
   * Core fetch+stream sequence shared by handleSend and the three
   * retry handlers.
   *
   * Failed-send rollback (Session 19, Step C smoke fix): the user
   * message is NOT committed to the messages array until the fetch
   * succeeds (response.ok && response.body). If the fetch throws or
   * returns !ok, the messages array stays in its pre-send state — the
   * §2.8 empty-state panel keeps rendering, the agent header stays in
   * its empty-state variant, and the composer keeps the user's typed
   * text. The retry handler reads `apiError.retryUserText` to re-fire
   * the original failed message regardless of any subsequent edits the
   * user made to the composer.
   *
   * `appendUser`:
   *   - true (default, used by handleSend + handleApiRetry): the user
   *     message is appended on success, since it isn't in the array
   *     yet.
   *   - false (used by handleStreamErrorRetry + handleToolErrorRetry):
   *     the user message is already in the array (from the original
   *     successful send). Appending again would duplicate it.
   *
   * `removeIds` filters those ids out of the messages array atomically
   * with the new placeholder append, used by the stream-error and
   * tool-error retry paths to discard a partial assistant turn (and a
   * banner-message, when present).
   *
   * The composer is cleared (and the localStorage draft removed) only
   * after fetch.ok — clearing optimistically would lose the user's
   * text on failure.
   */
  async function streamRequest(
    userText: string,
    options?: { removeIds?: string[]; appendUser?: boolean },
  ) {
    const removeSet = new Set(options?.removeIds ?? []);
    const appendUser = options?.appendUser ?? true;
    setApiError(null);
    setIsStreaming(true);
    setWaitingForFirstToken(true);

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
          user_message: userText,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!isAbortError(err)) {
        setApiError({
          lead: COPY_API_ERROR_LEAD,
          body: COPY_API_ERROR_BODY,
          retryUserText: userText,
        });
      }
      // Nothing to roll back from the messages array — we never
      // committed. The composer keeps the user's text; banner shows.
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      abortRef.current = null;
      textareaRef.current?.focus();
      return;
    }

    if (!response.ok || !response.body) {
      const errorCode = await readErrorCode(response);
      const errorCopy = messageForErrorCode(errorCode);
      setApiError({
        lead: errorCopy.lead,
        body: errorCopy.body,
        retryUserText: userText,
      });
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      abortRef.current = null;
      textareaRef.current?.focus();
      return;
    }

    // Fetch succeeded — NOW commit the user message (if needed) plus a
    // fresh assistant placeholder, atomic with any removeIds cleanup.
    // One setMessages call so React doesn't render an intermediate
    // state. Then clear the composer.
    const tempUserId = `tmp-user-${Date.now()}`;
    const tempAssistantId = `tmp-assistant-${Date.now()}`;
    setMessages((prev) => {
      const filtered = prev.filter((m) => !removeSet.has(m.id));
      const additions: ChatMessage[] = [];
      if (appendUser) {
        additions.push({
          id: tempUserId,
          role: "user",
          content: userText,
          sources: [],
          toolCalls: [],
        });
      }
      additions.push({
        id: tempAssistantId,
        role: "assistant",
        content: "",
        sources: [],
        toolCalls: [],
      });
      return [...filtered, ...additions];
    });
    setDraft("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY(agentId));
    }

    try {
      for await (const event of parseSseStream(response)) {
        handleStreamEvent(event);
      }
    } catch (err) {
      if (!isAbortError(err)) {
        // Stream-interrupted — append a synthetic banner-message at the
        // end of the partial assistant turn (spec §2.9). The partial
        // text stays as the failed turn's record; click-to-retry
        // discards both and re-fires the user's last message.
        appendMessage({
          id: `err-${Date.now()}`,
          role: "error_banner",
          content: "",
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

  async function handleSend() {
    const userMessage = draft.trim();
    if (!userMessage || isStreaming) return;
    // Don't clear draft, don't append to messages — both happen inside
    // streamRequest only after fetch.ok. If the request fails, the
    // composer keeps the user's text and the message list stays in
    // its pre-send state.
    await streamRequest(userMessage);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  /**
   * Retry an API-error-before-send. Reads the originally-failed text
   * from `apiError.retryUserText` — NOT from the messages array (the
   * failed user message was never committed there per the rollback
   * fix) and NOT from the composer draft (the user is free to type
   * a new attempt while the banner is up; retry fires the original).
   * The composer's current text stays put; if the user wants to send
   * the new draft instead, they hit Send. Two distinct affordances.
   */
  function handleApiRetry() {
    if (!apiError) return;
    void streamRequest(apiError.retryUserText);
  }

  /**
   * Retry a stream-interrupted error. Walks back from the end of the
   * messages array to find the banner-message and the partial
   * assistant turn that errored, plus the user message that produced
   * them. streamRequest discards both atomically and re-fires.
   */
  function handleStreamErrorRetry(bannerId: string) {
    const bannerIdx = messages.findIndex((m) => m.id === bannerId);
    if (bannerIdx <= 0) return;
    // Walk backward from the banner to find the partial assistant
    // and the user before it.
    let partialIdx = -1;
    let userIdx = -1;
    for (let i = bannerIdx - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && partialIdx < 0) {
        partialIdx = i;
        continue;
      }
      if (messages[i].role === "user" && partialIdx >= 0) {
        userIdx = i;
        break;
      }
    }
    if (userIdx < 0 || partialIdx < 0) return;
    const userText = messages[userIdx].content;
    const partialId = messages[partialIdx].id;
    // appendUser=false: the original user message is already in
    // messages (it produced the partial assistant we're discarding);
    // we'd duplicate if streamRequest re-appended it.
    void streamRequest(userText, {
      removeIds: [bannerId, partialId],
      appendUser: false,
    });
  }

  /**
   * Retry a tool-error from inside an errored ToolTraceCard. The
   * partial assistant turn is the message containing the errored tool
   * call; we discard it and re-fire the user message that produced it.
   * No banner-message is involved (tool errors surface in-card, not
   * inline) — only the assistant id needs cleanup.
   */
  function handleToolErrorRetry(assistantId: string) {
    const assistantIdx = messages.findIndex((m) => m.id === assistantId);
    if (assistantIdx <= 0) return;
    let userIdx = -1;
    for (let i = assistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userIdx = i;
        break;
      }
    }
    if (userIdx < 0) return;
    const userText = messages[userIdx].content;
    // appendUser=false: same reasoning as the stream-error retry path.
    void streamRequest(userText, {
      removeIds: [assistantId],
      appendUser: false,
    });
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
        // Server emitted an error frame mid-stream — same treatment as
        // a thrown stream interruption. Append the banner-message and
        // let the click-to-retry path do the cleanup.
        appendMessage({
          id: `err-${Date.now()}`,
          role: "error_banner",
          content: "",
          sources: [],
          toolCalls: [],
        });
        break;
      }
    }
  }

  // AgentHeader's `emptyState` variant flips when the conversation has
  // zero messages (Session 19, Fix 3). The §2.8 identity panel below
  // carries Model + Web search facts at full weight; duplicating them
  // in the header reads as redundant noise. Once any message lands
  // (user OR assistant), the panel disappears and the header reverts
  // to its full §2.1 form so those facts stay accessible.
  const isEmpty = messages.length === 0;
  // Synthesize the agent shape AgentHeader expects from the props this
  // surface already plumbs. Constructing locally keeps ChatInterface's
  // public API small (one prop per piece of agent metadata) rather
  // than threading a nested `agent` object that's only consumed here.
  const headerAgent = {
    id: agentId,
    name: agentName,
    description: agentDescription,
    model: agentModel || null,
    tools_enabled: webSearchEnabled ? ["web_search"] : [],
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgentHeader
        agent={headerAgent}
        attachmentCount={agentAttachments.length}
        isOwner={isOwner}
        isDeleted={isDeleted ?? false}
        emptyState={isEmpty}
      />
      <MessageList
        agentName={agentName}
        agentDescription={agentDescription}
        agentModel={agentModel}
        webSearchEnabled={webSearchEnabled}
        agentUpdatedAt={agentUpdatedAt}
        agentAttachments={agentAttachments}
        messages={messages}
        isStreaming={isStreaming}
        isWaitingForFirstToken={waitingForFirstToken}
        streamErrorLead={COPY_STREAM_ERROR_LEAD}
        streamErrorBody={COPY_STREAM_ERROR_BODY}
        onStreamErrorRetry={handleStreamErrorRetry}
        onToolErrorRetry={handleToolErrorRetry}
      />
      {apiError ? (
        <div className="mx-auto w-full max-w-3xl pb-2">
          <ChatErrorMessage
            lead={apiError.lead}
            body={apiError.body}
            onRetry={handleApiRetry}
          />
        </div>
      ) : null}
      <div>
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

/**
 * Map a server discriminated-union error code to a user-facing
 * lead+body pair for the API-error banner. Per spec §2.9 the lead is
 * bold + short; the body is a sentence of explanation. All entries
 * stay clear of red / alarm tone — no "FAILED" / "ERROR" caps.
 */
function messageForErrorCode(code: string): { lead: string; body: string } {
  switch (code) {
    case "unauthenticated":
      return {
        lead: "Session expired.",
        body: "Sign in again to continue.",
      };
    case "forbidden":
      return {
        lead: "Access denied.",
        body: "You don't have access to this agent.",
      };
    case "agent_not_found":
    case "agent_not_native":
      return {
        lead: "Agent unavailable.",
        body: "This agent isn't available right now.",
      };
    case "invalid_input":
      return {
        lead: "Couldn't send.",
        body: "Try shortening the message or removing special characters.",
      };
    case "rate_limited":
      return {
        lead: "Slow down.",
        body: "You're sending messages too quickly. Wait a moment and try again.",
      };
    case "upstream_error":
      return {
        lead: "Couldn't respond.",
        body: "The assistant couldn't respond. Try again in a moment.",
      };
    case "internal_error":
    default:
      return {
        lead: "Couldn't send.",
        body: "Check your connection and try again.",
      };
  }
}
