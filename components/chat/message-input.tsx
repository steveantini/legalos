"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { AttachButton } from "./attach-button";
import { AttachmentPrivacyNote } from "./attachment-privacy-note";
import { DrivePicker, type DrivePickedFile } from "./drive-picker";
import { ModelPicker } from "./model-picker";
import { PendingAttachmentsRow } from "./pending-attachments-row";
import { SendButton } from "./send-button";
import { WebSearchIndicator } from "./web-search-indicator";

import {
  isReady,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type PendingAttachment,
} from "@/lib/chat/pending-attachment";
import { Textarea } from "@/components/ui/textarea";

interface MessageInputProps {
  agentId: string;
  agentModel: string;
  /**
   * True when the agent's `tools_enabled` JSONB array includes
   * "web_search". When true, the composer renders a read-only
   * WebSearchIndicator chip on the left of the tools row that links
   * to the edit form. When false, the composer renders nothing in
   * the web-search slot — toggling lives exclusively in the edit
   * form (session 17a polish iteration).
   */
  webSearchEnabled: boolean;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /**
   * Mirrors `isStreaming` from ChatInterface. While true: the textarea
   * is disabled, the send button is replaced with the Stop button, and
   * sends are gated. The model picker stays interactive so a user can
   * change the agent's model mid-stream and the next turn picks it up.
   */
  disabled: boolean;
  /**
   * Stop-generation handler (session 17b). Wired to the AbortController
   * in ChatInterface. When provided AND `disabled` is true, the send
   * button is replaced with a Stop button that calls this handler. Esc
   * during streaming also calls it (window-level listener owned by
   * ChatInterface, since `<textarea disabled>` does not dispatch
   * keyboard events per the WHATWG spec).
   */
  onStop?: () => void;
  /** Re-focus the textarea programmatically (after streaming completes). */
  focusRef?: { current: HTMLTextAreaElement | null };
  /** Pending (not-yet-sent) attachments, owned by ChatInterface. */
  pendingAttachments: PendingAttachment[];
  /** Fired with the files the user picked via the attach button. */
  onAttachFiles: (files: File[]) => void;
  /** Fired with the files the user picked from the Google Drive picker. */
  onAttachDrive: (files: DrivePickedFile[]) => void;
  /** Fired with a pending attachment's localId to remove it before send. */
  onRemoveAttachment: (localId: string) => void;
  /**
   * True while the session's one-time attachment privacy caption should
   * show. Owned by ChatInterface (appears on first attach, dismisses on send
   * or when the pending-attachments row clears). Rendered below the chip row,
   * above the textarea.
   */
  showPrivacyNote: boolean;
}

/**
 * Chat composer card (session 17a + 17b, spec §2.7; chat page redesign
 * commit 1 inverted the keyboard contract and dropped the hint row).
 *
 * Two-row vertical stack inside the white card surface (session 15):
 *
 *   1. Textarea — auto-grows, placeholder + screen-reader label.
 *   2. Tools row — left: <WebSearchIndicator/> (read-only chip,
 *      rendered only when `webSearchEnabled`; clicks link to the
 *      edit form); right: <ModelPicker/> (per-agent persistence via
 *      updateAgentModelAction) + send-or-stop button.
 *
 * Keyboard contract (chat page redesign commit 1):
 * - Return → send. Inverted from the prior ⌘/Ctrl+Return contract so the
 *   common case (send) needs no modifier — the platform-standard chat
 *   affordance.
 * - Shift+Return → newline (default browser behavior; we don't
 *   preventDefault) for multi-paragraph prompts.
 * - Esc while streaming → stop generation (window-level listener
 *   in ChatInterface; the textarea is disabled and won't fire keyboard
 *   events itself). A contextual "Esc to stop" caption fades in beside
 *   the send/stop button during generation (commit 1.5).
 *
 * The visible hint row was removed in the redesign: Return-to-send is the
 * platform-standard chat affordance and no longer needs inline documentation,
 * which also retired the SSR ⌘/Ctrl platform-glyph dance.
 *
 * Send / stop is a single <SendButton> (chat page redesign): one circle that
 * sends when idle and stops while streaming, with the fill / icon colors
 * inverting in place rather than swapping to a separate button. `showStop`
 * (= disabled && onStop, i.e. streaming with a stop handler available) drives
 * its `streaming` prop.
 */
export function MessageInput({
  agentId,
  agentModel,
  webSearchEnabled,
  value,
  onChange,
  onSend,
  disabled,
  onStop,
  focusRef,
  pendingAttachments,
  onAttachFiles,
  onAttachDrive,
  onRemoveAttachment,
  showPrivacyNote,
}: MessageInputProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);

  // Send is allowed when not streaming, no attachment is still uploading, and
  // there's something to send — typed text OR at least one ready attachment.
  // Attachments-only sends (no typed text) are allowed, matching the
  // frontier chat-surface pattern.
  const isUploadingAttachment = pendingAttachments.some(
    (a) => a.status === "attaching",
  );
  const hasReadyAttachment = pendingAttachments.some(isReady);
  const hasContent = value.trim().length > 0 || hasReadyAttachment;
  const canSend = !disabled && !isUploadingAttachment && hasContent;
  const atAttachmentCap =
    pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Return sends; Shift+Return inserts a newline. Return-to-send is the
    // chat-native default users reach for; multi-paragraph prompts stay
    // reachable via Shift+Return (D-052 keyboard contract).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        onSend();
      }
      return;
    }
    // Shift+Return / any other key falls through to default textarea
    // behavior (newline insertion). Esc-while-streaming is handled at the
    // window level by ChatInterface — the textarea is disabled during
    // streaming and won't dispatch keyboard events.
  }

  function handleSendClick() {
    if (canSend) {
      onSend();
    }
  }

  function setRef(el: HTMLTextAreaElement | null) {
    localRef.current = el;
    if (focusRef) focusRef.current = el;
  }

  const showStop = disabled && onStop;

  return (
    <div className="mx-auto w-full max-w-3xl pt-3 pb-2">
      {/* -ml-3 shifts the card left by its px-3 text inset (the children's
          horizontal padding) so the composer text lands at the column-left
          where the header text and assistant prose sit. The card keeps its
          internal padding — text stays clear of the rounded border — and its
          right edge stays at the column; only the left border extends ~12px
          into the gutter. */}
      <div className="-ml-3 rounded-[14px] border border-border-strong bg-card shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-14px_rgba(0,0,0,0.10)] transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-primary/45 focus-within:shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-14px_rgba(0,0,0,0.10),0_0_0_3px_oklch(0.4512_0.0766_258.9642_/_0.08)]">
        <PendingAttachmentsRow
          attachments={pendingAttachments}
          onRemove={onRemoveAttachment}
        />
        <AttachmentPrivacyNote visible={showPrivacyNote} />
        <div className="px-3 pt-3">
          <label htmlFor="message-input" className="sr-only">
            Message
          </label>
          {/* px-0 cancels the shadcn Textarea's default px-2.5 so the composer
              text isn't double-padded (card px-3 + textarea px-2.5) and sits
              closer to the assistant prose's left edge. */}
          <Textarea
            id="message-input"
            ref={setRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Type your message…"
            rows={2}
            className="resize-none border-0 bg-transparent px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 pt-1 pb-2">
          <div className="flex items-center gap-2">
            <AttachButton
              disabled={disabled || atAttachmentCap}
              reasonWhenDisabled={
                atAttachmentCap ? "Up to 5 files per message" : null
              }
              onFilesSelected={onAttachFiles}
              onChooseDrive={() => setDrivePickerOpen(true)}
            />
            {webSearchEnabled ? <WebSearchIndicator agentId={agentId} /> : null}
          </div>
          <div className="flex items-center gap-2">
            <ModelPicker agentId={agentId} initialModel={agentModel} />
            {showStop ? (
              <span
                aria-hidden
                className="text-[11px] text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none"
              >
                Esc to stop
              </span>
            ) : null}
            <SendButton
              onClick={handleSendClick}
              onStop={onStop}
              disabled={!canSend}
              streaming={Boolean(showStop)}
            />
          </div>
        </div>
      </div>
      <DrivePicker
        open={drivePickerOpen}
        onOpenChange={setDrivePickerOpen}
        remainingSlots={MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length}
        onAttach={onAttachDrive}
      />
    </div>
  );
}
