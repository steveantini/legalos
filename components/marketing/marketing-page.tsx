import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

/**
 * Shared editorial shell for real (non-stub) marketing pages, extracted
 * from the Trust Center idiom (Tier 1a, D-126): a minimal brand header
 * linking home, a mono-caps "Section · Page" label, an h1, an optional
 * one-paragraph lead, the caller's content in a single ~736px reading
 * column, and a quiet back link.
 *
 * The reading column is CENTERED in the viewport (mx-auto), the right
 * convention for a single narrow prose measure: left-anchoring it left
 * too much whitespace on the right (D-131). The brand header sits on the
 * landing's gutter (px-6, px-10 from 720px), so the brand mark stays
 * pinned to the edge while the column floats centered, exactly as it
 * read before the brief left-anchor experiment. Every page consuming
 * the shell (including the Trust hub, harmonized in D-130) inherits the
 * alignment and rhythm from here; layout changes belong in this file,
 * not on pages.
 *
 * Server components only — no client-side interactivity.
 */

interface MarketingPageShellProps {
  /** Mono-caps breadcrumb-style label, e.g. "Company · About". */
  label: string;
  /**
   * Optional linked hub segment rendered before the label as
   * "Hub · label". Sub-pages of a hub (Trust, Legal, Documentation) pass
   * their hub here so the top label gives the way back UP, mirroring the
   * bottom back link. Pages without a hub omit it and keep the plain label.
   */
  breadcrumb?: { label: string; href: string };
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
  breadcrumb,
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
          <Wordmark />
        </Link>
      </header>

      <main className="px-6 pb-16 pt-10 min-[720px]:px-10 min-[720px]:pt-14">
        <div className="mx-auto w-full max-w-[736px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
            {breadcrumb ? (
              <>
                <Link
                  href={breadcrumb.href}
                  className="underline-offset-[3px] transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {breadcrumb.label}
                </Link>
                {" · "}
              </>
            ) : null}
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
  /** Optional anchor id so the section is directly linkable (e.g. /features#governance). */
  id?: string;
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
  id,
  children,
}: MarketingSectionProps) {
  return (
    <section id={id} className="mt-10 scroll-mt-6 border-t border-hairline pt-8">
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

/**
 * Prominent "draft, not yet effective" banner for the Legal document pages
 * (Tier 3, D-135). A distinct caution callout, set apart from the document
 * body in the caution palette, so a logged-out visitor can never mistake a
 * draft for binding, effective terms. Sits at the top of each document page.
 */
export function MarketingDraftBanner({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      role="note"
      className="mt-7 rounded-lg border border-warn-fg/40 bg-warn-bg px-5 py-4"
    >
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-warn-fg-deep">
        Draft · Not yet effective
      </p>
      <p className="mt-2 text-[13.5px] leading-[1.6] text-warn-fg-deep">
        {children}
      </p>
    </div>
  );
}

/**
 * A reviewer note for the Legal drafts: a "[Draft note: ...]" annotation
 * rendered as a visually-distinct aside (tinted fill, caution accent, muted
 * smaller type, mono label), so it is unmistakably an annotation for the
 * operator and counsel and NOT part of the legal text. Placed inside a
 * section's body, after the clause it annotates.
 */
export function MarketingDraftNote({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <aside className="rounded-md border border-hairline border-l-[3px] border-l-warn-fg bg-paper-2 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-warn-fg-deep">
        Draft note
      </p>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground">
        {children}
      </p>
    </aside>
  );
}

/**
 * A bracketed fill-in placeholder in a draft document (e.g. [Effective date]).
 * Rendered verbatim, but visually marked as an intentional fill-in so it is
 * never mistaken for a real value. The drafts deliberately leave these blank
 * rather than inventing entity names, jurisdictions, dates, or figures.
 */
export function MarketingPlaceholder({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="rounded-[3px] bg-paper-2 px-1 py-px font-mono text-[0.85em] text-caption">
      {children}
    </span>
  );
}

interface MarketingLegalSectionProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

/**
 * One numbered section of a legal document (Tier 3). A lighter heading than
 * MarketingSection, since a legal document carries many sections, with a
 * hairline divider and the reading type set on the body wrapper. Children are
 * the clause paragraphs plus any <MarketingDraftNote> annotations.
 */
export function MarketingLegalSection({
  number,
  title,
  children,
}: MarketingLegalSectionProps) {
  return (
    <section className="mt-8 border-t border-hairline pt-6">
      <h2 className="text-[17px] font-semibold leading-snug tracking-tight text-foreground">
        <span className="text-caption">{number}.</span> {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-[1.75] text-ink-2">
        {children}
      </div>
    </section>
  );
}
