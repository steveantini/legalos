"use client";

import { MessageSquare } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitFeedback } from "@/lib/actions/feedback";
import {
  FEEDBACK_ACKNOWLEDGMENT,
  FEEDBACK_KIND_OPTIONS,
  FEEDBACK_MESSAGE_MAX,
  type FeedbackKind,
} from "@/lib/feedback/shared";
import { cn } from "@/lib/utils";

/**
 * The always-reachable feedback affordance (Step One), rendered in the shared
 * rail footer so it is present on every authenticated page (workspace, admin,
 * platform). Built to the luxury standard: the trigger is QUIET (an understated
 * row, no color, no badge, present-not-pushy); the form opens in place, calm and
 * near-frictionless (one textarea, an optional gentle type); the acknowledgment
 * is gracious. The user types only their words; the route is captured here and
 * everything identifying is server-stamped by the action.
 */
export function FeedbackLauncher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const messageId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<Exclude<FeedbackKind, "other"> | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, start] = useTransition();

  function reset() {
    setMessage("");
    setKind(null);
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Reset only once the close animation can't show a flash of stale content.
    if (!next) reset();
  }

  function handleSend() {
    if (pending || message.trim().length === 0) return;
    const qs = searchParams.toString();
    const route = qs ? `${pathname}?${qs}` : pathname;
    start(async () => {
      const result = await submitFeedback({
        message: message.trim(),
        kind: kind ?? undefined,
        route,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSubmitted(true);
    });
  }

  return (
    <>
      {/* The quiet trigger. Understated row in the rail footer: no fill at rest,
          a one-shade hover, caption-weight until hovered. Present, not pushy. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-[10px] rounded-md px-2 py-[7px] text-left text-[12.5px] text-caption transition-colors duration-release ease-release hover:bg-hairline hover:text-foreground hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        <MessageSquare aria-hidden className="size-[15px] shrink-0" strokeWidth={1.75} />
        <span>Feedback</span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          {submitted ? (
            // The gracious acknowledgment — composed, unhurried, the last thing
            // the user sees. Not a terse toast.
            <div className="flex flex-col gap-5 py-2">
              <DialogHeader>
                <DialogTitle>Thank you</DialogTitle>
                <DialogDescription className="text-[13.5px] leading-[1.6] text-muted-foreground">
                  {FEEDBACK_ACKNOWLEDGMENT}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <DialogHeader>
                <DialogTitle>Share feedback</DialogTitle>
                <DialogDescription className="text-[13.5px] leading-[1.6] text-muted-foreground">
                  A bug, an idea, or something that felt off. We read every note.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={messageId} className="sr-only">
                  Your feedback
                </label>
                <textarea
                  id={messageId}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={5}
                  maxLength={FEEDBACK_MESSAGE_MAX}
                  autoFocus
                  className="block w-full resize-none rounded-lg border border-hairline bg-paper-2 px-3.5 py-3 text-[14px] leading-[1.55] text-foreground outline-none transition-colors duration-release ease-release placeholder:text-muted-foreground/70 focus:border-hairline-strong motion-reduce:transition-none"
                />
              </div>

              {/* Optional, gentle type. Offered, not demanded; toggles off when
                  the selected pill is tapped again (defaults to 'other'). */}
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_KIND_OPTIONS.map((option) => {
                  const active = kind === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setKind(active ? null : option.value)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12.5px] transition-colors duration-hover ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                        active
                          ? "border-hairline-strong bg-secondary text-foreground"
                          : "border-hairline bg-paper-2 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={pending || message.trim().length === 0}
                >
                  {pending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
