"use client";

import { FileTextIcon, Loader2Icon, MoreHorizontalIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface MessageActionsMenuProps {
  messageId: string;
}

/**
 * Overflow ("kebab") menu in the action row below a completed assistant
 * message, beside CopyButton. This is the destination hub for export and
 * send-to actions — Word today, with Google Docs / Slack / Gmail and other
 * destinations landing here as additional items rather than as more direct
 * buttons in the row. Keeping new destinations behind one affordance is the
 * deliberate choice: the row stays Copy + kebab no matter how many
 * destinations ship, so the at-rest surface never grows louder.
 *
 * One item today: "Export to Word (.docx)". Its behavior — fetch the export
 * route, convert the response to a Blob, fire a virtual-anchor download, and
 * surface a toast on failure — is ported verbatim from the prior
 * DownloadMessageButton (which this menu replaces). The route's HTTP shape and
 * error codes are unchanged; only the trigger affordance moved from a direct
 * button to a menu item.
 *
 * Pending state lives on the item, not the trigger: while the export is in
 * flight the item disables and its leading icon swaps to a spinner. The menu
 * is held open during the request (`closeOnClick={false}`) so that spinner is
 * actually visible; it closes naturally on the next interaction (outside
 * click, Escape, or re-selection). The browser's download chrome is the
 * success signal, so there's no success toast — only an error one.
 *
 * Gated upstream by `isExportable` in MessageBubble (a hydration check): the
 * kebab only renders once the message has a server-issued id, same condition
 * the prior direct button used.
 */
export function MessageActionsMenu({ messageId }: MessageActionsMenuProps) {
  const [pending, startTransition] = useTransition();

  function handleExportToWord() {
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
    <DropdownMenu>
      {/* Secondary-action visual language: text-caption at rest,
          text-foreground on hover, polish #15 motion tokens. Matches
          CopyButton and the prior DownloadMessageButton, so the kebab reads
          as part of the same quiet action group. Bare (no tooltip) to mirror
          CopyButton; aria-label carries the accessible name. */}
      <DropdownMenuTrigger
        aria-label="More actions"
        className={cn(
          "inline-flex items-center justify-center rounded-md p-1.5 text-caption",
          "transition-colors duration-release ease-release motion-reduce:transition-none",
          "hover:text-foreground hover:duration-hover hover:ease-soft",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <MoreHorizontalIcon className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        <DropdownMenuItem
          disabled={pending}
          closeOnClick={false}
          onClick={handleExportToWord}
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileTextIcon className="size-4" aria-hidden />
          )}
          Export to Word (.docx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
