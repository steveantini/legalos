/**
 * Calendar connection gate and today's-events source for the workspace home
 * "Today" card.
 *
 * `isCalendarConnected` now reads real connection state from the database (the
 * connection data model, migration 0044) via `hasActiveConnectionInCategory`.
 * It returns false today only because no connections exist yet (OAuth ships in
 * a later milestone), but it is reading live state, not a hardcoded false. The
 * Today card still shows its "Connect your calendar" placeholder for every user
 * until a real calendar connection is created.
 *
 * Server-only (it transitively imports the Supabase server client); imported
 * only by server components.
 */

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
 * Returns an empty array for now: with no connected provider there is nothing
 * to fetch. When calendar OAuth ships, this reads the user's events for the
 * current day from the connected provider and maps them onto NormalizedEvent.
 * The Today card only calls this when isCalendarConnected is true, so today
 * the array is never even requested for a real render.
 */
export async function getTodaysEvents(
  userId: string,
): Promise<NormalizedEvent[]> {
  if (!(await isCalendarConnected(userId))) return [];
  // Connected path (unreachable until OAuth ships): fetch + normalize the
  // provider's events for today here.
  return [];
}
