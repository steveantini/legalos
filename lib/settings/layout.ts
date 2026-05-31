import { SECTION_CONTENT_MAX_WIDTH } from "@/lib/workspace/layout";

/**
 * Shared layout tokens for the settings family of pages.
 *
 * Every settings reading page (the landing and Connections today; more as the
 * area grows) renders its `<main>` at this single width so the family stays
 * spatially consistent. The contract — "all settings reading pages are the same
 * width" — is encoded here as one source of truth rather than repeated inline,
 * so a new page or a future width change can't silently drift one page off the
 * family.
 *
 * It lives here, not in `app/workspace/settings/layout.tsx`, because that layout
 * deliberately does not impose a `<main>` wrapper: the coming-soon sub-pages
 * (Profile, Display) own their own full-height centered `<main>`, and a
 * layout-level one would nest landmarks and break their centering. Those stubs
 * are not reading pages and do not consume this width.
 *
 * 896px (`max-w-4xl`), up from the original 768px (`max-w-3xl`): 768px was sized
 * for single-column reading, but Connections is now a two-column grid and the
 * upcoming admin arc has more multi-column surfaces, so the family width is
 * right-sized for a multi-column future. The wider 1024px was declined as too
 * wide for a settings reading column; 896px is the deliberate middle that fits
 * two columns comfortably while keeping one consistent family width. Recorded in
 * DECISION_LOG D-073.
 *
 * As of D-074 the value is shared with admin via `SECTION_CONTENT_MAX_WIDTH`
 * (`lib/workspace/layout.ts`): settings and admin are one section family at one
 * width. This alias is kept for the existing settings consumers and the
 * documented name; it now derives from the shared source so the two can't drift.
 */
export const SETTINGS_PAGE_MAX_WIDTH = SECTION_CONTENT_MAX_WIDTH;
