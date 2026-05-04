"use client";

import { Send } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

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
  disabled: boolean;
  /** Re-focus the textarea programmatically (after streaming completes). */
  focusRef?: { current: HTMLTextAreaElement | null };
}

/**
 * Chat composer card (session 17a, spec §2.7).
 *
 * Three-row vertical stack inside the white card surface (session 15):
 *
 *   1. Textarea — auto-grows, placeholder + screen-reader label.
 *   2. Tools row — left: <WebSearchIndicator/> (read-only chip,
 *      rendered only when `webSearchEnabled`; clicks link to the
 *      edit form); right: <ModelPicker/> (per-agent persistence via
 *      updateAgentModelAction) + send button.
 *   3. Hint — keyboard contract copy, centered, mono caption.
 *
 * Keyboard behavior (per the Session 8b plan and web-accessibility.md):
 * - Enter (no modifiers) → submits.
 * - Shift+Enter → inserts a newline.
 * - Send button is reachable via Tab.
 *
 * The `disabled` prop tracks streaming state; the textarea is
 * `disabled={disabled}` while streaming. Send is gated on
 * value.trim().length > 0 so empty submits are blocked even when not
 * streaming. The model picker is NOT gated on streaming — a user can
 * change model mid-stream and the next turn picks up the new config
 * (the chat route reads model fresh per turn). The web-search
 * indicator is read-only and unaffected by streaming state.
 */
export function MessageInput({
  agentId,
  agentModel,
  webSearchEnabled,
  value,
  onChange,
  onSend,
  disabled,
  focusRef,
}: MessageInputProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim().length > 0) {
        onSend();
      }
    }
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-4">
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
            <Button
              type="button"
              onClick={handleSendClick}
              disabled={disabled || value.trim().length === 0}
              aria-label="Send message"
              className="size-9 p-0"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
        <p className="px-3 pb-2 text-center text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </div>
  );
}
