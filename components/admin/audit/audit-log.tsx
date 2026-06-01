"use client";

import { UserCheck, UserCog, UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { loadMoreAuditAction } from "@/lib/actions/admin-audit";
import type {
  AuditEvent,
  AuditPage,
  OrgRole,
} from "@/lib/workspace/admin/audit/audit-log";

const ROLE_LABEL: Record<OrgRole, string> = {
  super_admin: "Super admin",
  org_admin: "Org admin",
  user: "User",
};

/** Absolute date + time, e.g. "May 11, 2026, 2:34 PM". */
function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

/**
 * The unified People activity feed (A6) — a read-only, reverse-chronological list
 * of role changes and account-status changes, merged from the two audit tables.
 * Each row reads as a plain sentence (friendly role names, never raw enums or
 * UUIDs); a null actor renders as "The system" with a subtle direct-change hint,
 * a null target as "a former member".
 *
 * Initial events arrive server-rendered (no skeleton round-trip). Load-more
 * appends older events via a server action; the button shows a pending label
 * while the next page resolves (no blank/snap — the existing rows stay put).
 */
export function AuditLog({ initial }: { initial: AuditPage }) {
  const [events, setEvents] = useState<AuditEvent[]>(initial.events);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initial.hasMore);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor || pending) return;
    const at = cursor;
    startTransition(async () => {
      const next = await loadMoreAuditAction(at);
      setEvents((prev) => [...prev, ...next.events]);
      setCursor(next.nextCursor);
      setHasMore(next.hasMore);
      if (next.events.length === 0) {
        // Edge: the conservative hasMore over-reached; settle honestly.
        setHasMore(false);
      }
      if (!next.nextCursor && next.events.length === 0) {
        toast.message("No more activity to load.");
      }
    });
  }

  if (events.length === 0) {
    return (
      <div className="mt-10 rounded-lg bg-paper-2 px-6 py-12 text-center">
        <p className="text-[15px] font-medium text-foreground">No activity yet</p>
        <p className="mx-auto mt-2 max-w-[52ch] text-[13px] leading-[1.5] text-muted-foreground">
          When someone changes a person’s role or deactivates and reactivates an
          account, it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <ul className="flex flex-col gap-2">
        {events.map((event) => (
          <AuditRow key={`${event.kind}:${event.id}`} event={event} />
        ))}
      </ul>

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={pending}
          >
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** One event as a filled row: an event-type glyph, a sentence, and the time. */
function AuditRow({ event }: { event: AuditEvent }) {
  const { Icon, sentence } = describe(event);
  const isSystem = event.actor.id === null;

  return (
    <li className="flex items-start gap-3.5 rounded-lg bg-paper-2 px-5 py-4">
      <Icon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-[1.5] text-muted-foreground">
          {sentence}
        </p>
        <p className="mt-1 text-[12px] text-caption tabular-nums">
          {formatWhen(event.createdAt)}
          {isSystem ? " · direct change" : ""}
        </p>
      </div>
    </li>
  );
}

/** A name / role fragment rendered with emphasis inside the sentence. */
function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/** Maps an event to its glyph + a friendly sentence (React nodes). */
function describe(event: AuditEvent): {
  Icon: typeof UserCog;
  sentence: React.ReactNode;
} {
  if (event.kind === "role_change") {
    return {
      Icon: UserCog,
      sentence: (
        <>
          <Strong>{event.actor.name}</Strong> changed{" "}
          <Strong>{event.target.name}</Strong> from{" "}
          <Strong>{ROLE_LABEL[event.oldRole]}</Strong> to{" "}
          <Strong>{ROLE_LABEL[event.newRole]}</Strong>
        </>
      ),
    };
  }

  // status_change
  const reactivated = event.nowActive === true;
  return {
    Icon: reactivated ? UserCheck : UserMinus,
    sentence: (
      <>
        <Strong>{event.actor.name}</Strong>{" "}
        {reactivated ? "reactivated" : "deactivated"}{" "}
        <Strong>{event.target.name}</Strong>
      </>
    ),
  };
}
