/**
 * "For your reading" — the bottom section of the workspace home. v1 is a
 * single honest empty-state card: there is no reading content yet (no
 * reading_items table, no curation tooling), so rather than fake items the
 * section names its own not-yet state and previews what will land here.
 *
 * Server component, fully static. When admin-curated reading ships (a
 * future arc), the empty-state card gives way to a real card grid on the
 * same surface.
 *
 * Header idiom mirrors the rest of the home: an 18px medium heading (the
 * unified home-section heading scale) paired with a right-aligned mono
 * status caption. The empty-state copy is centered on a constrained
 * measure so it reads as an empty state, not as content.
 */
export function ReadingSection() {
  return (
    <section
      aria-labelledby="reading-section-heading"
      className="flex flex-col gap-5"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="reading-section-heading"
          className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
        >
          For your reading
        </h2>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption">
          Curation tools coming
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-12">
        <p className="mx-auto max-w-[56ch] text-center text-[14px] leading-[1.55] text-muted-foreground">
          Your admin hasn’t shared anything here yet. When admin-curated
          reading tools ship, regulations, podcasts, and internal headlines
          will land here for your role.
        </p>
      </div>
    </section>
  );
}
