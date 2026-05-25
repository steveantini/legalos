/**
 * Workspace route-group loading boundary.
 *
 * Renders an instant skeleton during navigation between workspace routes,
 * replacing the "frozen old page" sensation (the prior page stays on screen
 * until the destination's dynamic server render completes) with immediate
 * visual feedback. The rail, top bar, and body padding live in the parent
 * `app/workspace/layout.tsx` and persist across the transition; this
 * skeleton only fills the `{children}` slot of the layout's body wrapper,
 * so it inherits the wrapper's `px-14 pt-14 pb-8` padding and `gap-9`
 * rhythm — it must not add its own outer padding.
 *
 * Giving the App Router a loading boundary here is also what lets prefetch
 * do useful work on these dynamic (auth-cookie) routes: without a boundary,
 * a dynamic route can't be prefetched and every click waits on a cold
 * server render.
 *
 * Shape is deliberately generic — a header bar (the h1 + description shared
 * by departments / knowledge / workflows / integrations / help) over a
 * responsive card grid (matching the group-landing grid the majority of
 * destinations use). It is "close enough" for every workspace destination
 * that the skeleton-to-content swap reads as coherent rather than matching
 * any single page pixel-for-pixel. Loading boundaries can't know the
 * destination route, so a generic shape is the correct trade-off.
 *
 * Aesthetic matches Stage 2b's `SectionSkeleton` (animate-pulse on muted
 * bg, hairline card border, 14px radius) and honors `prefers-reduced-motion`
 * via `motion-reduce:animate-none`.
 */
export default function WorkspaceLoading() {
  return (
    <main className="flex flex-col gap-9">
      {/* Header skeleton — h1 bar over a narrower description bar. */}
      <header className="flex flex-col gap-3">
        <div className="h-[44px] w-1/2 max-w-[400px] animate-pulse rounded-md bg-muted/40 motion-reduce:animate-none" />
        <div className="h-[14px] w-[70%] max-w-[500px] animate-pulse rounded-md bg-muted/30 motion-reduce:animate-none" />
      </header>

      {/* Card-grid skeleton — mirrors the responsive group-landing grid. */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-[192px] animate-pulse rounded-[14px] border border-card-border bg-muted/30 motion-reduce:animate-none"
          />
        ))}
      </div>
    </main>
  );
}
