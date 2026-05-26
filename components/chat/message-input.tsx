"use client";

import { useRef, type KeyboardEvent } from "react";

import { ModelPicker } from "./model-picker";
import { SendButton } from "./send-button";
import { WebSearchIndicator } from "./web-search-indicator";

import { Button } from "@/components/ui/button";
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
 *   the Stop button during generation (commit 1.5) and disappears when
 *   the Stop button swaps back to Send.
 *
 * The visible hint row was removed in the redesign: Return-to-send is the
 * platform-standard chat affordance and no longer needs inline documentation,
 * which also retired the SSR ⌘/Ctrl platform-glyph dance.
 *
 * Stop button visual: icon-only filled square at size-9 (12×12 inner
 * square via `size-3 bg-current`), `aria-label="Stop generating"`, paper-
 * tone outline variant for visual differentiation from the filled-ink
 * send button. Spec §2.6 calls for visible "STOP" text alongside the
 * glyph; that doesn't fit cleanly in the 36×36 footprint at the spec's
 * mono-caps weight, and icon-only matches the send button's restraint.
 * Flagged for revisit if smoke wants the visible label.
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
}: MessageInputProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Return sends; Shift+Return inserts a newline. Return-to-send is the
    // chat-native default users reach for; multi-paragraph prompts stay
    // reachable via Shift+Return.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim().length > 0) {
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
    if (!disabled && value.trim().length > 0) {
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
      <div className="rounded-[14px] border border-border-strong bg-card shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-14px_rgba(0,0,0,0.10)] transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-primary/45 focus-within:shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-14px_rgba(0,0,0,0.10),0_0_0_3px_oklch(0.4512_0.0766_258.9642_/_0.08)]">
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
            {showStop ? (
              <Button
                type="button"
                variant="outline"
                onClick={onStop}
                aria-label="Stop generating"
                className="size-9 bg-paper-2 p-0"
              >
                <span aria-hidden className="size-3 bg-current" />
              </Button>
            ) : (
              <SendButton
                onClick={handleSendClick}
                disabled={disabled || value.trim().length === 0}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
