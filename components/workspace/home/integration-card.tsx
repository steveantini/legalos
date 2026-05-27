import Link from "next/link";

type IntegrationCardProps = {
  /** Display name, e.g. "Slack", "Mail", "Drive". */
  serviceName: string;
  /** Where the "Set up →" link routes. */
  ctaHref: string;
};

/**
 * One integration entry card for the workspace home's integrations row.
 * Honest placeholder: a mono eyebrow naming the service as not connected,
 * a heading naming the action, and a "Set up →" link. Pure presentation,
 * server-rendered.
 *
 * Mirrors the calendar Connect card's idiom (rounded-xl / border-border /
 * bg-card, mono eyebrow, slate CTA) at a smaller scale — p-6, a 10px
 * eyebrow, a 15px heading — since three of these sit across one tight row.
 * The heading is a plain <p>, not a heading element: these are visual
 * subsections inside an aria-labelled (but visually unlabelled) row, not
 * standalone titled sections.
 *
 * The card is intentionally static at rest with no card-level hover — the
 * link inside is the single interactive target, so a competing card hover
 * would muddy what's clickable.
 */
export function IntegrationCard({ serviceName, ctaHref }: IntegrationCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="mb-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-caption">
        {serviceName} · not connected
      </p>
      <p className="mb-3 text-[15px] font-medium text-foreground">
        Connect {serviceName}
      </p>
      <Link
        href={ctaHref}
        aria-label={`Set up ${serviceName}`}
        className="text-[13px] font-medium text-primary hover:underline"
      >
        Set up →
      </Link>
    </div>
  );
}
