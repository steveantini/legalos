"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AgentHeader } from "./agent-header";
import { ChatErrorMessage } from "./chat-error-message";
import type { DrivePickedFile } from "./drive-picker";
import { DropOverlay } from "./drop-overlay";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import type { ChatMessage } from "./message-bubble";

import {
  removeMessageAttachmentAction,
  uploadMessageAttachmentAction,
} from "@/lib/actions/message-attachments";
import type { CompareRole } from "@/lib/agents/pre-steps/document-compare";
import {
  isReady,
  MAX_ATTACHMENTS_PER_MESSAGE,
  toSendPayload,
  type PendingAttachment,
} from "@/lib/chat/pending-attachment";
import type { ConfirmationDecision } from "@/lib/chat/mcp-confirmation";
import {
  parseSseStream,
  type ChatStreamEvent,
  type ChatToolCall,
} from "@/lib/chat/sse-parser";
import { usePacedText } from "@/lib/chat/use-paced-text";
import { cn } from "@/lib/utils";

/**
 * localStorage key for the per-agent draft autosave (session 17b, spec §2.7).
 */
const DRAFT_STORAGE_KEY = (agentId: string) => `legalos.draft.${agentId}`;

/**
 * Default instruction used when a Document Comparison turn is sent with the two
 * slots filled but no typed message. The agent runs from its documents, so a typed
 * prompt is optional; this gives the turn a valid, non-empty user message (the
 * route requires one) and a clear instruction. Em-dash-free per the copy convention.
 */
const DOCUMENT_COMPARE_DEFAULT_PROMPT =
  "Compare these two documents and explain what changed and what matters.";
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
  /**
   * True when the agent declares the document-compare deterministic pre-step
   * (the locked built-in Document Comparison agent, and any fork of it). Swaps the
   * generic attachment composer for the two-slot Original/Revised input (D-188).
   */
  documentCompareEnabled?: boolean;
  isDeleted?: boolean;
  /**
   * Owner-of-agent flag used by AgentHeader to gate the Edit link.
   * Plumbed through ChatInterface rather than landing on AgentHeader
   * directly from the page because AgentHeader is mounted inside
   * ChatInterface.
   */
  isOwner: boolean;
  /**
   * True when the agent is a Pattern B canonical template (Session 27).
   * AgentHeader uses this to branch the top-right action slot between
   * Edit (admin) and Customize (non-admin). (The template chip the meta
   * row once rendered was dropped in the chat page redesign.)
   */
  isTemplate?: boolean;
  /**
   * True when the current user is super_admin / org_admin. Only
   * meaningful in combination with `isTemplate`. Drives the Edit-vs-
   * Customize choice in AgentHeader's top-right slot.
   */
  canManageTemplates?: boolean;
  /**
   * True for a fully-locked legalOS system-tier agent. Threaded straight to
   * AgentHeader, which surfaces "Copy" for everyone (admins included).
   */
  isFullyLocked?: boolean;
  /** Attachment count for AgentHeader's "N attached" chip. */
  agentAttachmentCount: number;
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
  documentCompareEnabled = false,
  isDeleted,
  isOwner,
  isTemplate = false,
  canManageTemplates = false,
  isFullyLocked = false,
  agentAttachmentCount,
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

  // ---- Chat-attachments state (chat attachments arc) ----
  // Pending (not-yet-sent) attachments rendered as chips in the composer.
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  // Client-pre-allocated id for the NEXT user message (D-055). Attachment
  // uploads write under this id's storage path and the send payload carries
  // it; regenerated after each successful send. Kept distinct from the
  // optimistic message's tmp- id so the user-bubble entrance animation (keyed
  // on the "tmp-" prefix) still fires.
  const [nextMessageId, setNextMessageId] = useState(() => crypto.randomUUID());
  // Pre-allocated conversation id for a fresh chat so uploads have a final
  // storage path before the first send. Once the conversation is persisted
  // (the SSE meta handler sets conversationId), that canonical id takes over;
  // for a continuing conversation, conversationId is already non-null.
  const [freshConversationId] = useState(() => crypto.randomUUID());
  const pendingConversationId = conversationId ?? freshConversationId;

  // ---- Attachment privacy note (session-scoped, chat attachments arc) ----
  // The one-line reassurance caption shows once per mount, the first time the
  // user attaches a file. Two flags so it shows through the send moment but
  // never re-appears later in the session:
  //   - hasBeenShown: sticky for the mount; once true the note won't re-trigger
  //     on a later attach.
  //   - shouldShow: the live visibility flag, raised on first attach and
  //     lowered when the pending-attachments row clears (via send or removal).
  // Session = this mount; a reload re-shows on first attach, by design: no
  // localStorage persistence for a costless one-line reassurance caption.
  const [privacyNoteHasBeenShown, setPrivacyNoteHasBeenShown] = useState(false);
  const [privacyNoteShouldShow, setPrivacyNoteShouldShow] = useState(false);

  // ---- Whole-surface drag-and-drop (chat attachments arc) ----
  // True while a file drag hovers the chat surface; drives the drop overlay.
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  // Browser drag events fire dragenter/dragleave on every nested child the
  // cursor crosses (the message list, the composer, individual bubbles). A
  // bare boolean would flicker as the cursor moves between them. The depth ref
  // counts net enters minus leaves so the overlay shows while depth > 0 and
  // hides only when the drag has truly left the surface.
  const dragDepthRef = useRef(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Draft autosave: restore on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY(agentId));
    if (stored && stored.length > 0) {
      // localStorage draft restore must run in an effect, not a lazy initializer, to avoid an SSR hydration mismatch; same pattern as the admin metrics modals.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Paced streaming text (lib/chat/use-paced-text.ts): append() buffers token
  // text and drains it to the last assistant message at a steady visual rate
  // so display cadence doesn't track irregular network bursts. flush() empties
  // the buffer immediately (stream end / abort / before structural events);
  // reset() clears it for a fresh request.
  const {
    append: appendPacedText,
    flush: flushPacedText,
    reset: resetPacedText,
  } = usePacedText({
    onText: (text) =>
      updateLastAssistant((m) => ({ ...m, content: m.content + text })),
    // Lowered from the hook default (8) for a slightly faster reveal that
    // still reads smooth; tune toward 3-4 if it should move faster.
    divisor: 5,
  });

  /**
   * Core fetch+stream sequence shared by handleSend and the three
   * retry handlers.
   *
   * Failed-send rollback (Session 19, Step C smoke fix): the user
   * message is NOT committed to the messages array until the fetch
   * succeeds (response.ok && response.body). If the fetch throws or
   * returns !ok, the messages array stays in its pre-send state — when
   * it was empty, the centered empty-state layout (the
   * `messages.length === 0` branch in the render below) keeps rendering,
   * and the composer keeps the user's typed text. The retry handler
   * reads `apiError.retryUserText` to re-fire the original failed
   * message regardless of any subsequent edits the user made to the
   * composer.
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
    // Clean slate: discard any residual paced-text buffer before this turn's
    // assistant placeholder starts receiving tokens.
    resetPacedText();

    const controller = new AbortController();
    abortRef.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          conversation_id: pendingConversationId,
          message_id: nextMessageId,
          user_message: userText,
          attachments: toSendPayload(pendingAttachments),
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
      // A UUID collision on the pre-allocated message id is extraordinarily
      // unlikely (a real bug or race). Regenerate so a retry uses a fresh id.
      if (errorCode === "message_id_conflict") {
        setNextMessageId(crypto.randomUUID());
      }
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
          // Display the ready attachments on the optimistic user bubble. On
          // reload these hydrate from message_attachments instead. Kept as the
          // tmp- id (not nextMessageId) so the entrance animation still fires.
          attachments: pendingAttachments.filter(isReady).map((a) => ({
            filename: a.filename,
            sizeBytes: a.sizeBytes,
            contentType: a.contentType,
          })),
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
    // This send consumed the pending attachments and the pre-allocated id;
    // clear the chips and roll a fresh id for the next message.
    setPendingAttachments([]);
    // The row just cleared, so the privacy caption has done its job; hide it.
    // hasBeenShown stays true, so a later attach this session won't re-show it.
    setPrivacyNoteShouldShow(false);
    setNextMessageId(crypto.randomUUID());

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
      // Emit any text still buffered when the stream ends — covers the abort
      // and interruption paths where no "done" event fired to flush it.
      // Idempotent after a normal completion (the done event already flushed).
      flushPacedText();
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

  async function handleSend() {
    let userMessage = draft.trim();
    // The Document Comparison agent runs from its two documents, so a typed
    // message is optional: when the user sends with a slot filled but no text,
    // supply a default instruction so the turn is valid (and any missing-slot
    // guard still fires server-side rather than the send dead-ending here).
    if (
      !userMessage &&
      documentCompareEnabled &&
      pendingAttachments.some(isReady)
    ) {
      userMessage = DOCUMENT_COMPARE_DEFAULT_PROMPT;
    }
    if (!userMessage || isStreaming) return;
    // A pending write-confirmation must be decided before the conversation
    // continues — otherwise the resumed turn would graft onto the wrong bubble
    // (2P-7b). Keep the user's draft; just hold the send with a gentle nudge.
    const hasPendingConfirmation = messages.some((m) =>
      m.toolCalls.some((c) => c.status === "awaiting_confirmation"),
    );
    if (hasPendingConfirmation) {
      toast.error("Approve or deny the pending action before sending a new message.");
      return;
    }
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
   * Upload one or more picked files as pending attachments. Each shows as an
   * "attaching" chip immediately, then uploads in parallel; the chip settles
   * to ready or failed as its action resolves. Enforces the 5-per-message cap
   * (counting attaching + ready + failed chips) before uploading.
   */
  async function handleAttachFiles(files: File[]) {
    const remainingSlots =
      MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
    if (remainingSlots <= 0) {
      toast.error("Up to 5 files per message.");
      return;
    }
    let toUpload = files;
    if (files.length > remainingSlots) {
      toast.error(
        `Up to 5 files per message. ${remainingSlots} slot${remainingSlots === 1 ? "" : "s"} remaining.`,
      );
      toUpload = files.slice(0, remainingSlots);
    }
    if (toUpload.length === 0) return;

    // First real attach this session raises the privacy caption. Gated on
    // hasBeenShown so it never re-appears after the row has cleared once.
    if (!privacyNoteHasBeenShown) {
      setPrivacyNoteHasBeenShown(true);
      setPrivacyNoteShouldShow(true);
    }

    const newPending: PendingAttachment[] = toUpload.map((file) => ({
      localId: crypto.randomUUID(),
      status: "attaching",
      filename: file.name,
      sizeBytes: file.size,
      contentType: file.type,
    }));
    setPendingAttachments((prev) => [...prev, ...newPending]);

    await Promise.all(
      newPending.map(async (pending, index) => {
        const file = toUpload[index];
        const formData = new FormData();
        formData.append("conversation_id", pendingConversationId);
        formData.append("message_id", nextMessageId);
        formData.append("file", file);

        const result = await uploadMessageAttachmentAction(formData);

        setPendingAttachments((prev) =>
          prev.map((p) => {
            if (p.localId !== pending.localId) return p;
            if (result.ok) {
              return {
                localId: p.localId,
                status: "ready",
                filename: result.attachment.originalFilename,
                sizeBytes: result.attachment.sizeBytes,
                contentType: result.attachment.contentType,
                storagePath: result.attachment.storagePath,
                extractionWarning: result.attachment.extractionWarning,
              };
            }
            return {
              localId: p.localId,
              status: "failed",
              filename: pending.filename,
              sizeBytes: pending.sizeBytes,
              contentType: pending.contentType,
              errorCode: result.error,
            };
          }),
        );

        if (result.ok && result.attachment.extractionWarning) {
          toast.warning(
            `${pending.filename}: ${result.attachment.extractionWarning}`,
          );
        }
      }),
    );
  }

  /**
   * Add files picked from the Google Drive picker as pending attachments. Unlike
   * uploads there is no "attaching" phase: a Drive attachment is immediately
   * ready (its content is fetched live server-side at run-time, not uploaded),
   * so each lands as a ready gdrive_link chip carrying only the file id and the
   * pick-time display metadata. The picker already caps its selection to the
   * remaining slots; this re-checks the 5-per-message cap as a backstop.
   */
  function handleAttachDriveFiles(files: DrivePickedFile[]) {
    if (files.length === 0) return;
    const remainingSlots =
      MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
    const toAdd = files.slice(0, Math.max(0, remainingSlots));
    if (toAdd.length === 0) {
      toast.error("Up to 5 files per message.");
      return;
    }
    const newPending: PendingAttachment[] = toAdd.map((file) => ({
      localId: crypto.randomUUID(),
      status: "ready",
      source: "gdrive_link",
      filename: file.name,
      sizeBytes: 0,
      contentType: file.mimeType,
      fileId: file.fileId,
      iconType: file.iconType,
    }));
    setPendingAttachments((prev) => [...prev, ...newPending]);
  }

  /**
   * Upload one document into a Document Comparison role slot ("original" /
   * "revised"). Reuses the same upload pipeline as handleAttachFiles, with two
   * differences: it holds at most one document per role (a new file REPLACES the
   * slot's current one, purging the old upload from Storage), and it tags the
   * pending attachment with its compareRole so the role rides the send payload to
   * the deterministic pre-step. Used only by the two-slot DocumentCompareInput.
   */
  async function handleAttachForRole(files: File[], role: CompareRole) {
    const file = files[0];
    if (!file) return;

    if (!privacyNoteHasBeenShown) {
      setPrivacyNoteHasBeenShown(true);
      setPrivacyNoteShouldShow(true);
    }

    // Replace whatever is already in this slot: purge a prior upload's Storage
    // object (Drive/failed/attaching carry nothing to purge) and drop its chip.
    const existing = pendingAttachments.find((p) => p.compareRole === role);
    if (existing && existing.status === "ready" && "storagePath" in existing) {
      const purge = new FormData();
      purge.append("storage_path", existing.storagePath);
      void removeMessageAttachmentAction(purge);
    }

    const localId = crypto.randomUUID();
    setPendingAttachments((prev) => [
      ...prev.filter((p) => p.compareRole !== role),
      {
        localId,
        status: "attaching",
        filename: file.name,
        sizeBytes: file.size,
        contentType: file.type,
        compareRole: role,
      },
    ]);

    const formData = new FormData();
    formData.append("conversation_id", pendingConversationId);
    formData.append("message_id", nextMessageId);
    formData.append("file", file);
    const result = await uploadMessageAttachmentAction(formData);

    setPendingAttachments((prev) =>
      prev.map((p) => {
        if (p.localId !== localId) return p;
        if (result.ok) {
          return {
            localId,
            status: "ready",
            filename: result.attachment.originalFilename,
            sizeBytes: result.attachment.sizeBytes,
            contentType: result.attachment.contentType,
            storagePath: result.attachment.storagePath,
            extractionWarning: result.attachment.extractionWarning,
            compareRole: role,
          };
        }
        return {
          localId,
          status: "failed",
          filename: file.name,
          sizeBytes: file.size,
          contentType: file.type,
          errorCode: result.error,
          compareRole: role,
        };
      }),
    );

    if (result.ok && result.attachment.extractionWarning) {
      toast.warning(`${file.name}: ${result.attachment.extractionWarning}`);
    }
  }

  /**
   * Remove a pending attachment before send. The chip vanishes immediately;
   * if the file reached Storage (ready), the object is purged. Failed chips
   * have nothing in Storage; attaching chips have no remove affordance, so
   * they never reach here.
   */
  async function handleRemoveAttachment(localId: string) {
    const target = pendingAttachments.find((p) => p.localId === localId);
    if (!target) return;
    setPendingAttachments((prev) => prev.filter((p) => p.localId !== localId));
    // Removing the last pending chip empties the row without a send; retire the
    // privacy caption (hasBeenShown keeps it from re-showing on a later attach),
    // so a subsequent plain-text message carries no stale caption.
    if (pendingAttachments.length === 1) {
      setPrivacyNoteShouldShow(false);
    }
    // Only local uploads have a Storage object to purge; a Drive-backed ready
    // attachment (M6b) carries no storagePath, so removing it is local-only.
    if (target.status === "ready" && "storagePath" in target) {
      const formData = new FormData();
      formData.append("storage_path", target.storagePath);
      const result = await removeMessageAttachmentAction(formData);
      if (!result.ok) {
        toast.error(
          "Removed from your message, but the file couldn't be fully deleted. It will be cleaned up automatically.",
        );
      }
    }
  }

  // ---- Whole-surface drag-and-drop handlers ----
  // All four gate on dataTransfer.types containing "Files" so text selections,
  // dragged links, and dragged images from other tabs don't trigger the
  // overlay. During a drag the file bytes aren't readable for security, but
  // the "Files" type marker is, which is all the gate needs. Plain function
  // declarations (not useCallback) to match this component's handler idiom —
  // they attach to a plain <div>, so referential stability buys nothing.

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setIsDraggingFiles(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    // preventDefault on dragover is required for the drop event to fire.
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    // Reuse the picker's orchestration: handleAttachFiles enforces the 5-file
    // cap and the overflow toast here, and the upload action enforces the MIME
    // allowlist and the per-file 20 MB cap server-side. Folders carry no
    // entries in dataTransfer.files, so they're silently ignored.
    void handleAttachFiles(files);
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

  /**
   * Approve or deny a paused MCP write (2P-7b), then stream the resumed loop
   * into the SAME assistant bubble. Optimistically settles the card to its
   * decided state, posts the decision to /api/chat/confirm, and consumes the
   * continuation SSE with the shared handler (tokens append to the bubble; a
   * second write would surface its own card). Works after a reload, since the
   * paused-run id rides the persisted trace.
   */
  async function handleConfirmDecision(
    pausedRunId: string,
    decision: ConfirmationDecision,
  ) {
    if (isStreaming) return;
    // Set the matching write's status: optimistic to settle the card, reverted
    // if the request fails so the Approve/Deny buttons return.
    function setConfirmationStatus(status: ChatToolCall["status"]) {
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" &&
          m.toolCalls.some((c) => c.confirmation?.paused_run_id === pausedRunId)
            ? {
                ...m,
                toolCalls: m.toolCalls.map((c) =>
                  c.confirmation?.paused_run_id === pausedRunId
                    ? { ...c, status }
                    : c,
                ),
              }
            : m,
        ),
      );
    }
    // Deny settles the card to its declined state. Approve now executes the
    // write (2P-7b-ii), so optimistically show it as a running trace; the
    // resume stream emits its real done/error outcome.
    setConfirmationStatus(decision === "deny" ? "denied" : "running");

    setApiError(null);
    setIsStreaming(true);
    resetPacedText();
    const controller = new AbortController();
    abortRef.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused_run_id: pausedRunId, decision }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!isAbortError(err)) {
        setConfirmationStatus("awaiting_confirmation");
        toast.error("Couldn't record your decision. Please try again.");
      }
      setIsStreaming(false);
      abortRef.current = null;
      return;
    }

    if (!response.ok || !response.body) {
      setConfirmationStatus("awaiting_confirmation");
      toast.error("Couldn't record your decision. Please try again.");
      setIsStreaming(false);
      abortRef.current = null;
      return;
    }

    try {
      for await (const event of parseSseStream(response)) {
        handleStreamEvent(event);
      }
    } catch (err) {
      if (!isAbortError(err)) {
        appendMessage({
          id: `err-${Date.now()}`,
          role: "error_banner",
          content: "",
          sources: [],
          toolCalls: [],
        });
      }
    } finally {
      flushPacedText();
      setIsStreaming(false);
      setWaitingForFirstToken(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

  function handleStreamEvent(event: ChatStreamEvent) {
    // Structural events act on the assistant message's current content:
    // tool-trace cards splice in at captured character positions, and citation
    // markers resolve against already-rendered text. Flush buffered text first
    // so they see the up-to-date message. Tokens append to the buffer; meta
    // touches no message — neither needs a flush.
    if (event.type !== "token" && event.type !== "meta") {
      flushPacedText();
    }
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
        // Clearing waitingForFirstToken stays immediate: the ThinkingGlyph
        // should disappear the moment the network confirms the agent has
        // started responding, even though the text itself reveals at the
        // paced rate.
        if (waitingForFirstToken) setWaitingForFirstToken(false);
        appendPacedText(event.text);
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
      case "tool_confirmation_required": {
        // The loop paused on a write (2P-7b). Settle the bubble to its real
        // assistant message id and add (or update) the pending write tool call
        // so its ConfirmationCard renders. The stream then closes cleanly; the
        // decision resumes it in a fresh request.
        if (waitingForFirstToken) setWaitingForFirstToken(false);
        updateLastAssistant((m) => {
          const pendingCall: ChatToolCall = {
            id: event.tool_call_id,
            name: event.tool_name,
            input: { argKeys: event.arg_keys },
            output: null,
            status: "awaiting_confirmation",
            started_at: new Date().toISOString(),
            position: m.content.length,
            access: "write",
            server: event.server,
            confirmation: { paused_run_id: event.paused_run_id },
          };
          const exists = m.toolCalls.some((c) => c.id === event.tool_call_id);
          const toolCalls = exists
            ? m.toolCalls.map((c) =>
                c.id === event.tool_call_id ? { ...c, ...pendingCall } : c,
              )
            : [...m.toolCalls, pendingCall];
          return { ...m, id: event.assistant_message_id, toolCalls };
        });
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

  // No messages yet → the header + composer sit together in the upper third
  // (commit 1.5; commit 1 dead-centered them). MessageList is omitted so its
  // flex-1 fill doesn't reintroduce the empty middle; once the first message
  // lands the standard layout takes over (header top, list fills, composer
  // bottom) and the conversation column animates in.
  const isEmpty = messages.length === 0;

  return (
    <div
      className={cn(
        // `relative` anchors the absolutely-positioned DropOverlay to the chat
        // surface (not the viewport) so it fills exactly this column.
        "relative flex min-h-0 flex-1 flex-col",
        // Upper-third, not dead-center: the top bar + workspace body padding
        // already offset this container ~112px down, so a modest viewport
        // top-pad lands the group around 35-40% from the top. Tune the vh if
        // it reads high or low across viewport heights.
        isEmpty && "pt-[14vh]",
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <AgentHeader
        agent={headerAgent}
        attachmentCount={agentAttachmentCount}
        isOwner={isOwner}
        isTemplate={isTemplate}
        canManageTemplates={canManageTemplates}
        isFullyLocked={isFullyLocked}
        conversationId={conversationId}
        isDeleted={isDeleted ?? false}
        isEmpty={isEmpty}
      />
      {!isEmpty ? (
        // First-message delight: the conversation column fades + rises in
        // when the surface flips from empty to active. The layout itself
        // switches in a single frame (the composer's reflow from mid-group
        // to bottom can't be CSS-transitioned), so this entrance carries the
        // moment rather than a partial layout tween. The wrapper forwards
        // MessageList's flex-1 role so the scroll + centerline math is intact.
        // Reduced motion → no animation, content just appears.
        <div className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            isWaitingForFirstToken={waitingForFirstToken}
            streamErrorLead={COPY_STREAM_ERROR_LEAD}
            streamErrorBody={COPY_STREAM_ERROR_BODY}
            onStreamErrorRetry={handleStreamErrorRetry}
            onToolErrorRetry={handleToolErrorRetry}
            onConfirmDecision={handleConfirmDecision}
          />
        </div>
      ) : null}
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
            documentCompareEnabled={documentCompareEnabled}
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            onStop={handleStop}
            disabled={isStreaming}
            focusRef={textareaRef}
            pendingAttachments={pendingAttachments}
            onAttachFiles={handleAttachFiles}
            onAttachDrive={handleAttachDriveFiles}
            onAttachForRole={handleAttachForRole}
            onRemoveAttachment={handleRemoveAttachment}
            showPrivacyNote={privacyNoteShouldShow}
          />
        )}
      </div>
      <DropOverlay visible={isDraggingFiles} />
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
