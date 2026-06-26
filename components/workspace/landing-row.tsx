import type { ReactNode } from "react";
import Link from "next/link";

/**
 * One row on a section landing (Settings, Admin). The landing standard (D-075):
 * a calm filled tile, `bg-paper-2` at rest with a one-shade hover-deepen to
 * `bg-secondary`, carrying a label, an editorial description, and a trailing
 * arrow, with the whole row as the link. The hairline divider sits on the
 * wrapper so it reads as a full-width editorial rule while the padded link
 * insets its highlight; this is the same filled-tile-with-hairline language the
 * Connections page uses.
 *
 * Every landing row is a navigation target, so every row hover-deepens — unlike
 * Connections, where only actionable (connected / connectable) rows do and
 * inert rows stay flat.
 *
 * Shared by the Settings and Admin landings (lifted here on the second consumer)
 * so the two cannot drift: there is one filled landing-row treatment, rendered
 * from one component. The older flat-hairline landing rows are superseded.
 */
export function LandingRow({
  label,
  description,
  href,
  indicator,
}: {
  label: string;
  description: string;
  href: string;
  /** An optional calm trailing indicator (e.g. an unseen count), rendered just
   * before the arrow. Undefined renders nothing. */
  indicator?: ReactNode;
}) {
  return (
    <div className="border-b border-hairline last:border-b-0">
      <Link
        href={href}
        className="group flex items-center gap-6 rounded-lg bg-paper-2 px-5 py-5 transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        <span className="w-[170px] shrink-0 text-[17px] font-medium text-foreground">
          {label}
        </span>
        <span className="flex-1 text-[13.5px] leading-[1.5] text-caption">
          {description}
        </span>
        {indicator ? <span className="ml-auto shrink-0">{indicator}</span> : null}
        <span
          aria-hidden
          className={`${indicator ? "" : "ml-auto "}shrink-0 text-primary opacity-40 transition-opacity duration-hover ease-soft group-hover:opacity-100 motion-reduce:transition-none`}
        >
          →
        </span>
      </Link>
    </div>
  );
}
