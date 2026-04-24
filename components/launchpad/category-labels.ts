/**
 * Maps category slugs (stored raw in `agents.category`) to human-friendly
 * section headings used in the launchpad UI. Unknown slugs fall back to a
 * title-cased version of the slug so a new category inserted via SQL or
 * the (eventual) admin UI will render acceptably without forcing a code
 * change — forkers get a safe default, not a broken heading.
 */

const LABELS: Record<string, string> = {
  "sell-side": "Sell-Side Agreements",
  "buy-side": "Buy-Side Agreements",
};

export function categoryLabel(slug: string): string {
  if (LABELS[slug]) return LABELS[slug];
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
