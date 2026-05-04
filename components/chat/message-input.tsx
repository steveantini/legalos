"use client";

import { Send } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  /** Re-focus the textarea programmatically (after streaming completes). */
  focusRef?: { current: HTMLTextAreaElement | null };
}

/**
 * Textarea + send button for the chat surface.
 *
 * Keyboard behavior (per the Session 8b plan and web-accessibility.md):
 * - Enter (no modifiers) → submits.
 * - Shift+Enter → inserts a newline.
 * - Send button is reachable via Tab.
 *
 * The textarea is `disabled={disabled}` while streaming. Tab still reaches
 * a disabled textarea, so the user can navigate; the send is gated on
 * value.trim() so empty submits are blocked even when not streaming.
 */
export function MessageInput({
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
        <div className="flex items-end gap-2 p-3">
          <div className="flex-1">
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
              aria-describedby="message-input-hint"
              placeholder="Type your message…"
              rows={2}
              className="resize-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
            <p
              id="message-input-hint"
              className="mt-1 text-xs text-muted-foreground"
            >
              Press Enter to send, Shift+Enter for a new line.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleSendClick}
            disabled={disabled || value.trim().length === 0}
            aria-label="Send message"
            className="h-10"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
