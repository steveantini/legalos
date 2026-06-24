"use client";

import { ClockIcon, MapPinIcon, UsersIcon, VideoIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useSyncExternalStore } from "react";

import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

import {
  buildMetaSegments,
  calendarColor,
  nowLineIndex,
  selectFocus,
  type MetaSegment,
} from "./today-schedule.helpers";

/** How often to re-evaluate the now-line and focus emphasis. */
const TICK_MS = 60_000;
/** Pixels of breathing room above the focus row when scrolled into view. */
const SCROLL_OFFSET = 8;

/**
 * A single ticking clock shared by the card, exposed through
 * useSyncExternalStore so the now value is null on the server and the first
 * client render (matching SSR, no hydration mismatch, the LocalDate idiom) and
 * the real time once subscribed, advancing each minute. Returning a cached
 * snapshot (not a fresh Date.now() per call) keeps the store stable between
 * ticks, and avoids the forbidden setState-in-effect.
 */
let currentNow: number | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

function subscribeClock(onChange: () => void): () => void {
  if (clockListeners.size === 0) {
    currentNow = Date.now();
    tick = setInterval(() => {
      currentNow = Date.now();
      clockListeners.forEach((listener) => listener());
    }, TICK_MS);
  }
  clockListeners.add(onChange);
  return () => {
    clockListeners.delete(onChange);
    if (clockListeners.size === 0 && tick !== null) {
      clearInterval(tick);
      tick = null;
      currentNow = null;
    }
  };
}

function useNowMs(): number | null {
  return useSyncExternalStore(
    subscribeClock,
    () => currentNow,
    () => null,
  );
}

type TodayTimelineProps = {
  events: NormalizedEvent[];
};

/**
 * Client island for the Today card's timed events. The now-line, the "Now"/
 * "Next" pill, and the initial scroll all depend on the user's real clock, and
 * the server renders in UTC on Vercel (the same reason `LocalDate` is a client
 * island). So all time-dependent state is computed AFTER mount: `nowMs` starts
 * null, matching the server and first client render (plain rows, no line, no
 * pill, scrolled to top), then fills in on mount and re-evaluates each minute.
 * This keeps hydration clean.
 *
 * The scroll region itself (slim scrollbar, edge fade, fills the row height and
 * scrolls on overflow) lives here; the date line and all-day band stay in the
 * server `TodaySchedule` parent.
 */
export function TodayTimeline({ events }: TodayTimelineProps) {
  const nowMs = useNowMs();
  const listRef = useRef<HTMLUListElement>(null);
  const focusRowRef = useRef<HTMLLIElement>(null);
  const hasScrolledRef = useRef(false);

  const focus = nowMs === null ? null : selectFocus(events, nowMs);
  const lineIndex = nowMs === null ? null : nowLineIndex(events, nowMs);

  // Once, after the clock is known, bring the focus row near the top. Guarded so
  // the 60s re-evaluation never yanks the user's scroll position later.
  useEffect(() => {
    if (hasScrolledRef.current || nowMs === null) return;
    hasScrolledRef.current = true;
    const list = listRef.current;
    const row = focusRowRef.current;
    if (!list || !row) return;
    const listTop = list.getBoundingClientRect().top;
    const rowTop = row.getBoundingClientRect().top;
    list.scrollTop += rowTop - listTop - SCROLL_OFFSET;
  }, [nowMs]);

  return (
    <ul
      ref={listRef}
      className="scrollbar-slim scroll-fade-y min-h-0 flex-1 overflow-y-auto"
    >
      {events.map((event, index) => (
        <Fragment key={event.id}>
          {lineIndex === index ? <NowLine nowMs={nowMs} /> : null}
          <EventRow
            event={event}
            pill={focus?.index === index ? focus.state : null}
            rowRef={focus?.index === index ? focusRowRef : undefined}
          />
        </Fragment>
      ))}
      {lineIndex === events.length ? <NowLine nowMs={nowMs} /> : null}
    </ul>
  );
}

/** A single timed event row: time, colored spine node, title, and meta line. */
function EventRow({
  event,
  pill,
  rowRef,
}: {
  event: NormalizedEvent;
  pill: "now" | "next" | null;
  rowRef?: React.Ref<HTMLLIElement>;
}) {
  const segments = buildMetaSegments(event);

  return (
    <li ref={rowRef} className="flex gap-3">
      <span className="w-14 shrink-0 pt-3 text-right font-mono text-[12px] tabular-nums text-caption">
        {event.startTime}
      </span>
      {/* Spine: a continuous neutral hairline with one per-calendar-colored
          node dot per row sitting on it (the ring punches the line). */}
      <span aria-hidden className="relative w-[22px] shrink-0 self-stretch">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline" />
        <span
          className="absolute left-1/2 top-[18px] size-1.5 -translate-x-1/2 rounded-full ring-2 ring-card"
          style={{ backgroundColor: calendarColor(event.calendarId) }}
        />
      </span>
      <div className="min-w-0 flex-1 py-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
            {event.htmlLink ? (
              <a
                href={event.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {event.title}
              </a>
            ) : (
              event.title
            )}
          </p>
          {pill ? (
            <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[10px] font-medium text-primary-foreground">
              {pill === "now" ? "Now" : "Next"}
            </span>
          ) : null}
        </div>
        {segments.length > 0 ? (
          <MetaLine segments={segments} joinUrl={event.joinUrl} />
        ) : null}
      </div>
    </li>
  );
}

/**
 * The meta line: location and duration form a leading logistics group, then the
 * attendee summary, then the conference label, the three middot-separated.
 * Rendered inline (icons flow with the text) so the single-line truncation
 * holds. The conference label links to the join URL when present.
 */
function MetaLine({
  segments,
  joinUrl,
}: {
  segments: MetaSegment[];
  joinUrl?: string;
}) {
  const logistics = segments.filter(
    (s) => s.kind === "location" || s.kind === "duration",
  );
  const attendees = segments.find((s) => s.kind === "attendees");
  const conference = segments.find((s) => s.kind === "conference");

  const groups: React.ReactNode[] = [];
  if (logistics.length > 0) {
    groups.push(
      <span key="logistics">
        {logistics.map((segment, i) => (
          <span key={segment.kind} className={i > 0 ? "ml-2" : undefined}>
            <SegmentIcon kind={segment.kind} />
            {segment.text}
          </span>
        ))}
      </span>,
    );
  }
  if (attendees) {
    groups.push(
      <span key="attendees">
        <SegmentIcon kind="attendees" />
        {attendees.text}
      </span>,
    );
  }
  if (conference) {
    groups.push(
      <span key="conference">
        <SegmentIcon kind="conference" />
        {joinUrl ? (
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {conference.text}
          </a>
        ) : (
          conference.text
        )}
      </span>,
    );
  }

  return (
    <p className="truncate text-[12px] text-caption">
      {groups.map((group, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="mx-1.5">·</span> : null}
          {group}
        </Fragment>
      ))}
    </p>
  );
}

/** The inline ~14px muted icon for a meta segment. */
function SegmentIcon({ kind }: { kind: MetaSegment["kind"] }) {
  const className = "mr-1 inline size-3.5 shrink-0 align-[-2px] text-caption";
  if (kind === "location") return <MapPinIcon className={className} aria-hidden />;
  if (kind === "duration") return <ClockIcon className={className} aria-hidden />;
  if (kind === "attendees") return <UsersIcon className={className} aria-hidden />;
  return <VideoIcon className={className} aria-hidden />;
}

/**
 * The now-line: a neutral spine node in accent, a thin accent rule, and a small
 * mono "now · {local time}" label from the client clock. `nowMs` is non-null
 * whenever this renders (it is gated on the computed insertion index).
 */
function NowLine({ nowMs }: { nowMs: number | null }) {
  const label =
    nowMs === null
      ? ""
      : new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(nowMs));

  return (
    <li className="flex items-stretch gap-3" aria-label={`Now, ${label}`}>
      <span className="w-14 shrink-0" />
      <span aria-hidden className="relative w-[22px] shrink-0 self-stretch">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline" />
        <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card" />
      </span>
      <span className="flex flex-1 items-center gap-2 py-1.5">
        <span aria-hidden className="h-px flex-1 bg-primary/30" />
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-primary">
          now · {label}
        </span>
      </span>
    </li>
  );
}
