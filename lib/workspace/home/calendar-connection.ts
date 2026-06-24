/**
 * Calendar connection gate and today's-events source for the workspace home
 * "Today" card.
 *
 * `isCalendarConnected` reads real connection state from the database (the
 * connection data model, migration 0044) via `hasActiveConnectionInCategory`,
 * and `getTodaysEvents` reads the user's real Google Calendar through the same
 * govern-then-exercise path Drive uses: the M5 capability gate
 * (`canExerciseCapability`) authorizes and yields the connection id + token ref,
 * the M6a token layer (`getUsableAccessToken`) hands back a fresh access token,
 * and the read client fetches and normalizes today's events. Read-only.
 *
 * Server-only (it transitively imports the Supabase server client and the
 * node-runtime read client); imported only by server components.
 */

import {
  CalendarReadError,
  fetchTodaysCalendarEvents,
} from "@/lib/connections/providers/google-calendar-read";
import { canExerciseCapability } from "@/lib/connections/policy";
import { getUsableAccessToken } from "@/lib/connections/tokens";
import { hasActiveConnectionInCategory } from "@/lib/settings/connections";

/**
 * One calendar event, normalized to a provider-agnostic shape the schedule
 * view renders directly. The provider adapters (Google, Outlook) added under
 * the connector hub arc map their event payloads onto this type.
 */
export type NormalizedEvent = {
  id: string;
  /** Meeting title, shown on the row's first line. */
  title: string;
  /**
   * Display-ready local start time, e.g. "10:30 AM". Pre-formatted (not an ISO
   * string) so the view stays purely presentational; the provider adapter
   * formats to the user's timezone when it normalizes the event.
   */
  startTime: string;
  /** Display-ready local end time, e.g. "11:00 AM". Omitted when unknown. */
  endTime?: string;
  /** Attendee display names, in the provider's order. */
  attendees: string[];
  /** Conferencing label e.g. "Zoom", "Google Meet"; null when in-person. */
  conferenceLabel: string | null;
  /**
   * Identity of the calendar this event was read from, for a merged
   * multi-calendar view. `calendarName` is the calendar's (possibly overridden)
   * summary; color is derived from `calendarId` against our own curated palette,
   * not from the provider (see DECISION_LOG D-175). Always populated.
   */
  calendarId: string;
  calendarName: string;
  /** True for an all-day event (a date with no clock time). Always populated. */
  isAllDay: boolean;
  /**
   * Absolute start/end instants (epoch ms) for client-side now/next
   * computation, and the derived duration in whole minutes. Populated only for
   * timed events; all three are undefined for all-day events, and
   * `durationMinutes` is also omitted when the end is missing or non-positive.
   */
  startMs?: number;
  endMs?: number;
  durationMinutes?: number;
  /** Trimmed location string; omitted when the event has none. */
  location?: string;
  /**
   * Meeting join URL (video conference link); omitted when there is none. Read
   * from the conference data's video entry point, falling back to a Hangouts
   * link.
   */
  joinUrl?: string;
  /** Deep link to open the event in Google Calendar; omitted when absent. */
  htmlLink?: string;
};

/**
 * Whether `userId` has an active connection in the calendar capability
 * category that they can use. Reads real connection state (returns false today
 * because no connections exist yet).
 */
export async function isCalendarConnected(userId: string): Promise<boolean> {
  return hasActiveConnectionInCategory(userId, "calendar");
}

/**
 * The outcome of a Today read: the day's events, or a signal that the
 * connection needs reconnecting to grant a newly-required scope. Distinguishing
 * the two lets the card prompt a reconnect instead of misreading a pre-scope
 * token as an empty day.
 */
export type TodayEventsResult =
  | { status: "ok"; events: NormalizedEvent[] }
  | { status: "needs_reconnect" };

/**
 * Today's events for `userId`, across all their visible calendars, normalized
 * for the schedule view.
 *
 * Govern, then exercise: the capability gate authorizes a 'calendar' read and
 * returns the connection id + token ref; the token layer resolves a fresh access
 * token (refreshing if needed); the read client lists the user's calendars,
 * reads each visible one's day bounded in the user's timezone, and merges them.
 *
 * Two non-crashing outcomes besides success:
 * - `needs_reconnect`: the token predates the calendar-list scope
 *   (`calendar.calendarlist.readonly`), so the list call 403s. The connection is
 *   still healthy; the user just needs to reconnect to grant the new scope, so
 *   we surface a reconnect prompt rather than an empty card. We deliberately do
 *   NOT mark the connection `error` here (a refresh would succeed) — only a
 *   reconsent adds the scope.
 * - empty events: a dead/revoked token makes `getUsableAccessToken` mark the
 *   connection `status='error'` (next render falls back to the Connect state),
 *   and a transient Calendar API error just yields no events this render.
 */
export async function getTodaysEvents(
  userId: string,
): Promise<TodayEventsResult> {
  const decision = await canExerciseCapability(userId, "calendar", "read");
  if (!decision.allowed || !decision.tokenRef) {
    return { status: "ok", events: [] };
  }

  try {
    const accessToken = await getUsableAccessToken(
      decision.connectionId,
      decision.tokenRef,
    );
    const events = await fetchTodaysCalendarEvents(accessToken, new Date());
    return { status: "ok", events };
  } catch (err) {
    // A pre-scope token can't list calendars: prompt a reconnect, don't pretend
    // the day is empty.
    if (
      err instanceof CalendarReadError &&
      err.reason === "scope_insufficient"
    ) {
      return { status: "needs_reconnect" };
    }
    // TokenUnavailableError (token layer already marked the connection error)
    // and any other CalendarReadError degrade to an empty schedule.
    return { status: "ok", events: [] };
  }
}
