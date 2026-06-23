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
   * Display-ready local start time, e.g. "10:30". Pre-formatted (not an ISO
   * string) so the view stays purely presentational; the provider adapter
   * formats to the user's timezone when it normalizes the event.
   */
  startTime: string;
  /** Display-ready local end time, e.g. "11:00". Omitted when unknown. */
  endTime?: string;
  /** Attendee display names, in the provider's order. */
  attendees: string[];
  /** Conferencing label e.g. "Zoom", "Google Meet"; null when in-person. */
  conferenceLabel: string | null;
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
 * Today's events for `userId`, normalized for the schedule view.
 *
 * Govern, then exercise: the capability gate authorizes a 'calendar' read and
 * returns the connection id + token ref; the token layer resolves a fresh access
 * token (refreshing if needed); the read client fetches today's events bounded
 * in the user's calendar timezone and normalizes them.
 *
 * Degrades calmly to an empty array on any failure, never crashing the home: a
 * dead/revoked token makes `getUsableAccessToken` mark the connection
 * `status='error'`, so the next render sees no active calendar connection and
 * the card falls back to its Connect state (the reconnect prompt). A transient
 * Calendar API error just yields no events this render.
 */
export async function getTodaysEvents(
  userId: string,
): Promise<NormalizedEvent[]> {
  const decision = await canExerciseCapability(userId, "calendar", "read");
  if (!decision.allowed || !decision.tokenRef) return [];

  try {
    const accessToken = await getUsableAccessToken(
      decision.connectionId,
      decision.tokenRef,
    );
    return await fetchTodaysCalendarEvents(accessToken, new Date());
  } catch (err) {
    // TokenUnavailableError (token layer already marked the connection error)
    // and CalendarReadError alike degrade to an empty schedule.
    void (err instanceof CalendarReadError);
    return [];
  }
}
