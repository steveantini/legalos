import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

/** Events beyond this count collapse into the "+N more later today" line. */
const VISIBLE_LIMIT = 3;

type TodayScheduleProps = {
  events: NormalizedEvent[];
};

/**
 * Connected-state interior of the Today card: today's meetings as a list of
 * rows (time on the left, title and attendees on the right), matching the
 * Claude Design schedule format. Pure presentational server component — it
 * renders whatever events it is handed and computes the display date from the
 * server's current day (per-user timezone arrives with provider normalization).
 *
 * Dormant for now: the Today card only mounts this when isCalendarConnected is
 * true, which never happens until calendar OAuth ships (Share and connector
 * hub arc, roadmap item 2). Built and ready so the surface lights up the
 * moment a real calendar connects.
 *
 * The card frame (rounded-xl border bg-card p-5) and the "Today" section
 * heading live in the parent; this fills the padded interior.
 */
export function TodaySchedule({ events }: TodayScheduleProps) {
  const visible = events.slice(0, VISIBLE_LIMIT);
  const hiddenCount = events.length - visible.length;
  const displayDate = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-end">
        <span className="font-mono text-[11px] text-caption">{displayDate}</span>
      </div>

      {events.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nothing on your calendar today.
        </p>
      ) : (
        <>
          <ul>
            {visible.map((event) => (
              <li
                key={event.id}
                className="flex gap-4 border-t border-hairline py-3 first:border-t-0 first:pt-0"
              >
                <span className="w-12 shrink-0 pt-px font-mono text-[12px] tabular-nums text-caption">
                  {event.startTime}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-foreground">
                    {event.title}
                  </p>
                  <p className="truncate text-[12px] text-caption">
                    {formatAttendees(event.attendees)}
                    {event.conferenceLabel ? ` · ${event.conferenceLabel}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {hiddenCount > 0 ? (
            // Becomes a Link to the full day view when the calendar surface
            // ships; styled as a link today, no destination yet.
            <p className="mt-3 text-[12px] font-medium text-primary">
              +{hiddenCount} more later today
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Attendee summary line: first two names, then "+N" for the rest, e.g.
 * "Sarah Chen, James Park +2". Empty string when there are no attendees, so
 * the line collapses rather than rendering a stray separator.
 */
function formatAttendees(attendees: string[]): string {
  if (attendees.length === 0) return "";
  const shown = attendees.slice(0, 2);
  const extra = attendees.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} +${extra}` : shown.join(", ");
}
