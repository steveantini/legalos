"use client";

import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

interface DownloadMessageButtonProps {
  messageId: string;
}

/**
 * "Download as Word" button for a single assistant message. Click triggers a
 * fetch against the export route, converts the response to a Blob, and uses a
 * virtual anchor click to fire the native browser download — equivalent
 * visible behavior to a plain `<a href download>` but with proper error
 * surfaces (toast on failure instead of a broken download). While the export
 * is in flight, the icon swaps to a spinner and the button disables.
 *
 * Lives in the always-visible action row below a completed message, beside
 * CopyButton, and shares its muted-foreground / hover-darken treatment so the
 * two read as one coherent action group (previously this was a hover-revealed
 * icon in the message's top-right corner).
 *
 * Filename comes from the response's Content-Disposition header
 * (server constructs it as `<agent-slug>-<YYYY-MM-DD>.docx`); we
 * parse it client-side so the download UI shows the right name.
 * Falls back to "message.docx" if parsing fails.
 */
export function DownloadMessageButton({ messageId }: DownloadMessageButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      let response: Response;
      try {
        response = await fetch(`/api/exports/messages/${messageId}/docx`);
      } catch {
        toast.error("Could not export message. Check your connection.");
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(messageForErrorCode(body.error));
        return;
      }

      const blob = await response.blob();
      const filename =
        parseFilename(response.headers.get("content-disposition")) ??
        "message.docx";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Download as Word"
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1.5 text-caption",
        "transition-colors duration-release ease-release motion-reduce:transition-none",
        "hover:text-foreground hover:duration-hover hover:ease-soft",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed",
      )}
    >
      {pending ? (
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
      ) : (
        <DownloadIcon className="size-4" aria-hidden />
      )}
    </button>
  );
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/filename="?([^"]+)"?/);
  return match ? match[1] : null;
}

function messageForErrorCode(code: string | undefined): string {
  switch (code) {
    case "unauthenticated":
      return "Your session expired. Sign in again to download.";
    case "not_found":
      return "Message not found.";
    case "invalid_message":
      return "Only assistant messages can be exported.";
    case "internal_error":
    default:
      return "Could not export message. Try again.";
  }
}
