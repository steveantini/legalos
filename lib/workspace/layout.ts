/**
 * Shared reading width for the polished peer-mode sections (settings and admin).
 *
 * Both sections render their content at this single width so the family stays
 * spatially consistent as pages are added. Encoded once here — lifted out of
 * `lib/settings/layout.ts` when admin became the second consumer — so the
 * contract "every section page is the same width" can't silently drift one page
 * off the family.
 *
 * 896px (`max-w-4xl`): right-sized for the multi-column surfaces these sections
 * carry (the Connections grid, the admin areas). See D-073 (settings raised
 * 768 → 896px) and D-074 (admin reconciled from 1024px to the same family
 * width).
 */
export const SECTION_CONTENT_MAX_WIDTH = "max-w-4xl";
