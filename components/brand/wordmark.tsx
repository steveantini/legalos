import { siteConfig } from "@/config/site";

/**
 * The canonical product display name as a PLAIN STRING — for contexts that need
 * a string, not a node: the document `<title>`, `aria-label`s, and export
 * metadata. Single source of truth is `siteConfig.siteTitle` (config/site.ts);
 * a product rename is one edit there. (D-183)
 */
export const PRODUCT_NAME = siteConfig.siteTitle;

/**
 * The product wordmark (D-183). Renders the canonical product name and ALWAYS
 * preserves its own casing: an inline `text-transform: none` means that even
 * inside an UPPERCASED container (a mono-caps eyebrow, an all-caps heading) the
 * brand keeps its canonical casing. This is the permanent, structural fix for
 * the wordmark-flattening-to-uppercase class of bug (e.g. "legalOS" rendering as
 * "LEGALOS" in a section eyebrow): no ancestor's `text-transform` can alter it.
 *
 * Reads `siteConfig.siteTitle` live at render, so routing a structural wordmark
 * through this component makes it follow a rename of the single source.
 *
 * `className` is for sizing/weight/color only; it cannot re-enable a transform
 * because the inline style wins over a utility class for `text-transform`.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className} style={{ textTransform: "none" }}>
      {siteConfig.siteTitle}
    </span>
  );
}
