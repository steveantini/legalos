import Link from "next/link";

/**
 * Shared editorial shell for real (non-stub) marketing pages, extracted
 * from the Trust Center idiom (Tier 1a, D-126): a minimal brand header
 * linking home, a mono-caps "Section · Page" label, an h1, an optional
 * one-paragraph lead, the caller's content in a single ~680px reading
 * column, and a quiet back-to-legalOS link.
 *
 * The Trust Center page predates this shell and keeps its own inline
 * copy of the same idiom (its pillar sections carry extra structure);
 * harmonizing it onto this shell is fine whenever it is next touched.
 *
 * Server components only — no client-side interactivity.
 */

interface MarketingPageShellProps {
  /** Mono-caps breadcrumb-style label, e.g. "Company · About". */
  label: string;
  title: string;
  /** Optional lead paragraph rendered directly under the h1. */
  lead?: string;
  children: React.ReactNode;
}

export function MarketingPageShell({
  label,
  title,
  lead,
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

      <main className="mx-auto w-full max-w-[680px] px-6 pb-24 pt-16 min-[720px]:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
          {label}
        </p>

        <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
          {title}
        </h1>

        {lead ? (
          <p className="mt-8 text-[17px] leading-[1.65] text-ink-2">{lead}</p>
        ) : null}

        {children}

        <Link
          href="/"
          className="mt-16 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          ← Back to legalOS
        </Link>
      </main>
    </div>
  );
}

interface MarketingSectionProps {
  title: string;
  children: React.ReactNode;
}

/**
 * One editorial section: hairline divider, section heading, prose body.
 * Children are typically plain <p> elements; the body wrapper sets the
 * reading type so paragraphs need no classes of their own.
 */
export function MarketingSection({ title, children }: MarketingSectionProps) {
  return (
    <section className="mt-16 border-t border-hairline pt-12">
      <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground min-[720px]:text-[32px]">
        {title}
      </h2>
      <div className="mt-6 space-y-5 text-[15px] leading-[1.75] text-ink-2">
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
    <p className="mt-16 border-t border-hairline pt-10 text-[16px] leading-[1.7] text-foreground">
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
