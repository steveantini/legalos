import Link from "next/link";

interface MarketingComingSoonProps {
  label: string;
  description: string;
}

/**
 * Marketing-context coming-soon template — rendered by every placeholder
 * page in the `app/(marketing)/` route group (About, Pricing, FAQ, etc.)
 * pending real content.
 *
 * Distinct from `<ComingSoonContent>` in `components/coming-soon/`, which
 * lives inside the product chrome (rail + breadcrumb + workspace layout).
 * This marketing variant is a full-viewport standalone treatment at
 * marketing display scale, inheriting the landing surface's typography
 * and color tokens so the placeholder set reads as deliberate across the
 * marketing surface — not as scattered stubs.
 *
 * Server component — no client-side interactivity.
 */
export function MarketingComingSoon({
  label,
  description,
}: MarketingComingSoonProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
        {label}
      </p>

      <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
        Coming soon.
      </h1>

      <p className="mt-8 max-w-prose text-base leading-relaxed text-muted-foreground">
        {description}
      </p>

      <Link
        href="/"
        className="mt-12 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ← Back to legalOS
      </Link>
    </main>
  );
}
