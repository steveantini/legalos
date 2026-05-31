import { LandingRow } from "@/components/workspace/landing-row";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/nav";
import { captionLabel } from "@/lib/workspace/rail-styles";

/**
 * Admin landing — the super-admin's control room overview. Driven by
 * `ADMIN_NAV_GROUPS` (`lib/admin/nav.ts`), the same source the admin rail
 * consumes, so the rail and the landing teach the identical mental model:
 * admin's two jobs, GOVERN the use and MEASURE the value (D-074).
 *
 * Refined-list landing rather than a card grid: four purposeful areas read
 * calmer as a grouped list. Rows render through the shared `LandingRow`
 * (the filled landing standard, D-075) — the same component the settings
 * landing uses, so the two cannot drift. Section captions reuse the rail's
 * `captionLabel` token so the landing and rail share vocabulary visually.
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

            <div>
              {group.items.map((item) => (
                <LandingRow
                  key={item.href}
                  label={item.label}
                  description={item.description}
                  href={item.href}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
