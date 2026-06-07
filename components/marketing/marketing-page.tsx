import Link from "next/link";

/**
 * Shared editorial shell for real (non-stub) marketing pages, extracted
 * from the Trust Center idiom (Tier 1a, D-126): a minimal brand header
 * linking home, a mono-caps "Section · Page" label, an h1, an optional
 * one-paragraph lead, the caller's content in a single reading column,
 * and a quiet back link.
 *
 * The reading column is LEFT-ANCHORED on the landing's gutter (px-6,
 * px-10 from 720px), exactly like the landing hero, with a max-width
 * capping line length on the right (D-130). The brand header sits on
 * the same gutter, so the brand mark and the h1 share a left edge.
 * Every page consuming the shell (including the Trust hub, harmonized
 * in D-130) inherits the alignment and rhythm from here; layout changes
 * belong in this file, not on pages.
 *
 * Server components only — no client-side interactivity.
 */

interface MarketingPageShellProps {
  /** Mono-caps breadcrumb-style label, e.g. "Company · About". */
  label: string;
  title: string;
  /** Optional lead paragraph rendered directly under the h1. */
  lead?: string;
  /** Back-link target; defaults to the landing. Sub-pages point at their hub. */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}

export function MarketingPageShell({
  label,
  title,
  lead,
  backHref = "/",
  backLabel = "← Back to legalOS",
  children,
}: MarketingPageShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 pt-7 min-[720px]:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-[10px] text-[15px] font-semibold tracking-[-0.015em] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span
            aria-hidden
            className="inline-block h-[7px] w-[7px] rounded-full bg-primary"
          />
          legalOS
        </Link>
      </header>

      <main className="px-6 pb-16 pt-10 min-[720px]:px-10 min-[720px]:pt-14">
        <div className="w-full max-w-[640px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
            {label}
          </p>

          <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
            {title}
          </h1>

          {lead ? (
            <p className="mt-6 text-[17px] leading-[1.65] text-ink-2">{lead}</p>
          ) : null}

          {children}

          <Link
            href={backHref}
            className="mt-12 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {backLabel}
          </Link>
        </div>
      </main>
    </div>
  );
}

interface MarketingSectionProps {
  /** Optional mono-caps kicker above the heading (e.g. "Pillar one"). */
  kicker?: string;
  title: string;
  /** Optional quiet subtitle line under the heading. */
  tagline?: string;
  children: React.ReactNode;
}

/**
 * One editorial section: hairline divider, optional kicker, section
 * heading, optional tagline, prose body. Children are typically plain
 * <p> elements; the body wrapper sets the reading type so paragraphs
 * need no classes of their own.
 */
export function MarketingSection({
  kicker,
  title,
  tagline,
  children,
}: MarketingSectionProps) {
  return (
    <section className="mt-10 border-t border-hairline pt-8">
      {kicker ? (
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
          {kicker}
        </p>
      ) : null}
      <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground min-[720px]:text-[32px]">
        {title}
      </h2>
      {tagline ? (
        <p className="mt-2 text-[16px] text-muted-foreground">{tagline}</p>
      ) : null}
      <div className="mt-5 space-y-4 text-[15px] leading-[1.75] text-ink-2">
        {children}
      </div>
    </section>
  );
}

/**
 * A page's closing line: a short, slightly elevated final statement set
 * off by a hairline, reading as the editorial signature of the page.
 */
export function MarketingClosing({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-10 border-t border-hairline pt-8 text-[16px] leading-[1.7] text-foreground">
      {children}
    </p>
  );
}

/**
 * Inline prose link, used inside marketing body copy. Quiet at rest,
 * unmistakably a link on hover and focus.
 */
export function MarketingProseLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}
