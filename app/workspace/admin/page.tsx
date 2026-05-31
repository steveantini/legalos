import Link from "next/link";

import { ADMIN_NAV_GROUPS } from "@/lib/admin/nav";
import { captionLabel } from "@/lib/workspace/rail-styles";

/**
 * Admin landing — the super-admin's control room overview. Driven by
 * `ADMIN_NAV_GROUPS` (`lib/admin/nav.ts`), the same source the admin rail
 * consumes, so the rail and the landing teach the identical mental model:
 * admin's two jobs, GOVERN the use and MEASURE the value (D-074).
 *
 * Mirrors the settings landing's refined-list pattern (label + editorial
 * description + trailing arrow, hairline-divided rows) rather than a card grid:
 * four purposeful areas read calmer as a grouped list than as cards. The rows
 * carry the Connections row language — a calm `bg-paper-2` fill at rest with a
 * one-shade hover-deepen to `bg-secondary`, since every row is actionable (it
 * navigates to its area). Section captions reuse the rail's `captionLabel`
 * token so the landing and rail share vocabulary visually.
 *
 * The width and the `<main>` come from the admin layout (896px, the section
 * family width); this page renders a fragment inside it.
 *
 * The four areas are coming-soon as of A1; each is built in a later milestone.
 */
export default function AdminLandingPage() {
  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Admin
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Govern how your organization uses legalOS, and measure the value it
          delivers.
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-10">
        {ADMIN_NAV_GROUPS.map((group) => (
          <section key={group.caption} aria-labelledby={`admin-${group.caption}`}>
            <h2 id={`admin-${group.caption}`} className={`${captionLabel} mb-3`}>
              {group.caption}
            </h2>

            {/* Hairlines live on the wrappers (full-width editorial dividers);
                the padded Link inside is the calm filled surface that deepens
                one shade on hover. */}
            <div>
              {group.items.map((item) => (
                <div
                  key={item.href}
                  className="border-b border-hairline last:border-b-0"
                >
                  <Link
                    href={item.href}
                    className="group flex items-center gap-6 rounded-lg bg-paper-2 px-5 py-5 transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                  >
                    <span className="w-[170px] shrink-0 text-[17px] font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="flex-1 text-[13.5px] leading-[1.5] text-caption">
                      {item.description}
                    </span>
                    <span
                      aria-hidden
                      className="ml-auto shrink-0 text-primary opacity-40 transition-opacity duration-hover ease-soft group-hover:opacity-100 motion-reduce:transition-none"
                    >
                      →
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
