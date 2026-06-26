"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setFeedbackStatus } from "@/lib/actions/feedback";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackStatus,
  type FeedbackView,
} from "@/lib/feedback/shared";
import { cn } from "@/lib/utils";

/**
 * The platform-owner feedback queue (Step One): a calm, considered review of the
 * notes customers sent, newest first, each with its message, who sent it and
 * from which org, the kind, the context they were in, when, and its status. The
 * only action is moving the status (the wider CS-team workflow is deferred).
 * Calm, not anxious: no red counts, no urgency theater, just the queue and a
 * quiet status control per note.
 */

const KIND_LABELS: Record<FeedbackView["kind"], string> = {
  bug: "Something's off",
  idea: "Idea",
  confusion: "Confusion",
  other: "Note",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function FeedbackReview({ items }: { items: FeedbackView[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg bg-paper-2 px-5 py-4 text-[13.5px] leading-[1.5] text-muted-foreground">
        No feedback yet. When someone sends a note from inside the app, it will
        appear here with the context they were in.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <FeedbackRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function FeedbackRow({ item }: { item: FeedbackView }) {
  const router = useRouter();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [pending, start] = useTransition();

  const route = typeof item.context.route === "string" ? item.context.route : null;

  function onStatusChange(next: FeedbackStatus) {
    const previous = status;
    setStatus(next);
    start(async () => {
      const result = await setFeedbackStatus({ id: item.id, status: next });
      if (!result.ok) {
        setStatus(previous);
        toast.error(result.error);
        return;
      }
      toast.success("Status updated.");
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-hairline bg-paper-2 p-5">
      <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-foreground">
        {item.message}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-caption">
        <span className="text-muted-foreground">{KIND_LABELS[item.kind]}</span>
        <span aria-hidden>·</span>
        <span>
          {item.submitterName} <span className="text-muted-foreground/70">·</span>{" "}
          {item.organizationName}
        </span>
        <span aria-hidden>·</span>
        <span>{relativeTime(item.createdAt)}</span>
        {route ? (
          <>
            <span aria-hidden>·</span>
            <span className="font-mono text-[11px]">{route}</span>
          </>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <label className="text-[12px] text-muted-foreground" htmlFor={`status-${item.id}`}>
          Status
        </label>
        <select
          id={`status-${item.id}`}
          value={status}
          disabled={pending}
          onChange={(e) => onStatusChange(e.target.value as FeedbackStatus)}
          className={cn(
            "rounded-md border border-hairline bg-card px-2.5 py-1 text-[12.5px] text-foreground outline-none transition-colors focus-visible:border-hairline-strong disabled:opacity-60",
          )}
        >
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {FEEDBACK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
