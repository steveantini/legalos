import type { ReactNode } from "react";

/**
 * Metric-layer render primitives — the tile shell (analytics arc, Step 1).
 *
 * MetricTile is the calm section frame every analytics tile shares: a 17px
 * title, an optional one-line hint, then the body. It owns no data — each async
 * data tile fetches its metric and renders content, an empty message, or (via
 * the page's <Suspense>) a skeleton of the same shape, so the page never blocks
 * on one slow tile and nothing shifts as content arrives.
 *
 * The visual language (sizes, tokens, spacing) matches the org Insights surface
 * one tier down, so the three altitudes read as one family even though their
 * data seams differ.
 */
export function MetricTile({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-[17px] font-medium tracking-[-0.005em] text-foreground">
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 text-[13px] leading-[1.5] text-caption">{hint}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Calm in-tile message for the empty and pre-migration states (never a crash). */
export function MetricTileMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-paper-2 px-6 py-10 text-center">
      <p className="mx-auto max-w-[52ch] text-[13px] leading-[1.5] text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

/**
 * A pulsing skeleton block at a declared height — the building block for the
 * per-tile Suspense fallbacks. Honors prefers-reduced-motion (no pulse).
 */
export function MetricSkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-paper-2 motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}

/** Skeleton wrapper that reproduces the tile header so the fallback matches. */
export function MetricTileSkeleton({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} aria-busy>
      <h2 className="text-[17px] font-medium tracking-[-0.005em] text-foreground">
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 text-[13px] leading-[1.5] text-caption">{hint}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
