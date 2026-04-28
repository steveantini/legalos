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
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="flex items-end gap-2">
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
            className="resize-none"
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
  );
}
