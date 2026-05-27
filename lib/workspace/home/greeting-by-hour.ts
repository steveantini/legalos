/**
 * Maps a 24-hour clock hour (0–23) to a time-of-day greeting phrase.
 *
 * Used by the workspace home greeting (`HomeGreeting`) for both the mono
 * eyebrow line and the heading's greeting word. Extracted here so the
 * boundary hours live in one place and the mapping is unit-testable
 * independent of the component (tests land in a later stage).
 *
 * Boundaries: 04:00–11:59 morning, 12:00–16:59 afternoon, 17:00–21:59
 * evening, and 22:00–03:59 the late-night phrase.
 */
export function greetingByHour(hour: number): string {
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "You're up late";
}
