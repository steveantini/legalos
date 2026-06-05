import { LandingRow } from "@/components/workspace/landing-row";
import { PLATFORM_NAV_GROUPS } from "@/lib/platform/nav";
import { captionLabel } from "@/lib/workspace/rail-styles";

/**
 * Platform-admin landing — the platform owner's cross-tenant control room
 * overview (C4L/platform arc, Step 1). Mirrors the org admin landing one tier
 * up: a header (title + one-line intro), then the platform areas rendered
 * through the shared `LandingRow` (the filled landing standard, D-075), driven
 * by `PLATFORM_NAV_GROUPS` so the rail and landing teach the identical model and
 * cannot drift.
 *
 * `PLATFORM_NAV_GROUPS` is empty in Step 1, so the page renders an honest,
 * calm "more coming" state rather than a bare surface. It scales by adding
 * groups/items to that source: the content library lands as the first area
 * (Step 3) and the empty state gives way to real rows automatically, with no
 * change here. The width and the `<main>` come from the platform layout.
 */
export default function PlatformLandingPage() {
  const hasAreas = PLATFORM_NAV_GROUPS.length > 0;

  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Platform
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Administer legalOS across customers, the content library, and the
          platform itself.
        </p>
      </header>

      {hasAreas ? (
        <div className="mt-10 flex flex-col gap-10">
          {PLATFORM_NAV_GROUPS.map((group) => (
            <section
              key={group.caption}
              aria-labelledby={`platform-${group.caption}`}
            >
              <h2
                id={`platform-${group.caption}`}
                className={`${captionLabel} mb-3`}
              >
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
      ) : (
        <div className="mt-10 rounded-xl border border-border bg-paper-2 p-12">
          <p className="mx-auto max-w-[56ch] text-center text-[14px] leading-[1.55] text-muted-foreground">
            Platform sections will appear here as they ship. The curated content
            library is first, followed by cross-customer analytics and billing.
          </p>
        </div>
      )}
    </>
  );
}
