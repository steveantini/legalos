"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { ModelPicker } from "./model-picker";
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
 * Chat composer card (session 17a + 17b, spec §2.7).
 *
 * Three-row vertical stack inside the white card surface (session 15):
 *
 *   1. Textarea — auto-grows, placeholder + screen-reader label.
 *   2. Tools row — left: <WebSearchIndicator/> (read-only chip,
 *      rendered only when `webSearchEnabled`; clicks link to the
 *      edit form); right: <ModelPicker/> (per-agent persistence via
 *      updateAgentModelAction) + send-or-stop button.
 *   3. Hint — keyboard contract copy, centered, mono caption.
 *
 * Keyboard contract (session 17b, spec §2.7):
 * - ⌘/Ctrl+Return → send. The plain Enter key is reserved for newline
 *   so legal-domain users can compose multi-paragraph prompts without
 *   accidentally sending.
 * - Plain Return → newline (default browser behavior; we don't
 *   preventDefault).
 * - Esc while streaming → stop generation (window-level listener
 *   in ChatInterface; the textarea is disabled and won't fire keyboard
 *   events itself).
 *
 * The platform glyph in the hint defaults to "Ctrl" for the SSR pass;
 * Mac/iOS hydration swaps to "⌘". One-character flash on hydration is
 * acceptable for caption text.
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
  const [modKey, setModKey] = useState<"⌘" | "Ctrl">("Ctrl");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (/Mac|iPhone|iPad/i.test(navigator.platform)) {
      setModKey("⌘");
    }
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // ⌘+Return (Mac) or Ctrl+Return (Win/Linux) sends. We accept either
    // modifier on either platform — no platform branching at the handler
    // layer, only at the hint-copy layer.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!disabled && value.trim().length > 0) {
        onSend();
      }
      return;
    }
    // Plain Return / Shift+Return / any other key falls through to
    // default textarea behavior (newline insertion). Esc-while-streaming
    // is handled at the window level by ChatInterface — the textarea is
    // disabled during streaming and won't dispatch keyboard events.
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
    <div className="mx-auto w-full max-w-3xl pt-3 pb-4">
      <div className="rounded-[14px] border border-border-strong bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-14px_rgba(0,0,0,0.10)] transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-primary/45 focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-14px_rgba(0,0,0,0.10),0_0_0_3px_oklch(0.4512_0.0766_258.9642_/_0.08)]">
        <div className="px-3 pt-3">
          <label htmlFor="message-input" className="sr-only">
            Message
          </label>
          <Textarea
            id="message-input"
            ref={setRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Type your message…"
            rows={2}
            className="resize-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 pt-1 pb-2">
          <div className="flex items-center gap-2">
            {webSearchEnabled ? <WebSearchIndicator agentId={agentId} /> : null}
          </div>
          <div className="flex items-center gap-2">
            <ModelPicker agentId={agentId} initialModel={agentModel} />
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
              <Button
                type="button"
                onClick={handleSendClick}
                disabled={disabled || value.trim().length === 0}
                aria-label="Send message"
                className="size-9 p-0"
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="px-3 pb-2 text-center text-xs text-muted-foreground">
          {modKey} Return to send &middot; Return for newline &middot; Esc to stop
        </p>
      </div>
    </div>
  );
}
