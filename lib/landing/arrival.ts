/**
 * Cold-vs-return arrival signal for the public landing (D-128).
 *
 * Module scope is exactly the right lifetime for this flag: it persists
 * across client-side (soft) navigations within one loaded document, and
 * resets on a hard document load or refresh. A cold arrival therefore
 * reads `false` and plays the full entrance choreography; an in-app
 * return reads `true` and renders the landing already settled.
 *
 * The server bundle evaluates this module too, but `markArrivalRendered`
 * is only ever called from client effects, so SSR always sees `false`
 * and always renders the cold state. That makes the cold first client
 * render match the server HTML by construction: no hydration mismatch,
 * even though the server process is long-lived.
 */
let hasRenderedThisDocument = false;

/** True when the landing has already rendered in this loaded document. */
export function isReturnVisit(): boolean {
  return hasRenderedThisDocument;
}

/** Record that the landing rendered; idempotent. Call from client effects only. */
export function markArrivalRendered(): void {
  hasRenderedThisDocument = true;
}

/** Test-only reset so each test starts from a cold document. */
export function resetArrivalForTests(): void {
  hasRenderedThisDocument = false;
}
