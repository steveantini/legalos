import { LocalDate } from "@/components/workspace/local-date";

/**
 * Marketing landing top bar (Session 22 Step B).
 *
 * Server component. Brand mark on the left (animated dot scale-in at
 * 1180ms via `landing-dot-in`); a mono-caps date on the right, sharing the
 * caption-color register from the Aperture top-bar vocabulary. The former
 * standalone "Sign in" link was removed (D-171): the hero's primary CTA is
 * now state-aware ("Sign in" when signed out, "Enter workspace" when signed
 * in), so a second sign-in affordance here would be a duplicate.
 *
 * The date is the `<LocalDate>` client island ("Weekday · Month Day",
 * from the visitor's browser clock): a request-time server render is UTC
 * on Vercel and showed tomorrow's date during US evenings.
 */
export function LandingTopbar() {
  return (
    <header className="flex items-center justify-between px-6 pt-[22px] min-[720px]:px-10 min-[720px]:pt-[28px]">
      <div className="flex items-center gap-[10px] text-[15px] font-semibold tracking-[-0.015em] text-foreground">
        <span
          aria-hidden
          className="landing-dot-in inline-block h-[7px] w-[7px] rounded-full bg-primary"
        />
        legalOS
      </div>

      <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
        <LocalDate variant="long" />
      </div>
    </header>
  );
}
