"use client";

import { X } from "lucide-react";

interface ChatErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

/**
 * Inline dismissible banner shown above the message input when the chat
 * route returns an HTTP error or fetch throws (network failure). Mid-stream
 * `event: error` frames render as a system bubble in the message list
 * instead — see chat-interface.tsx.
 *
 * Per the Session 8b plan, no toasts and no modals. Inline banner keeps
 * the user in the chat flow.
 */
export function ChatErrorBanner({ message, onDismiss }: ChatErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-2xl items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded p-0.5 text-destructive/80 hover:bg-destructive/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
