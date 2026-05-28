/**
 * Calendar connection gate and today's-events source for the workspace home
 * "Today" card.
 *
 * Both functions carry their final production signatures so the call sites are
 * stable; only the bodies change when calendar OAuth ships under the Share and
 * connector hub arc (roadmap item 2). Until then no provider can be connected,
 * so the gate stays closed and there is nothing to fetch — the Today card
 * shows its "Connect your calendar" placeholder for every user.
 */

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
 * Whether `userId` has a connected calendar provider.
 *
 * Returns false until calendar OAuth ships under the Share and connector hub
 * arc (roadmap item 2). When that lands, this queries the integrations table
 * for a calendar-provider row owned by the user. The signature is the final
 * production signature; only the body changes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `userId` is the final signature; unused only while the body is the closed-gate stub.
export async function isCalendarConnected(userId: string): Promise<boolean> {
  return false;
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
