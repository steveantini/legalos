import Link from "next/link";

/**
 * Marketing landing top bar (Session 22 Step B).
 *
 * Server component. Brand mark on the left (animated dot scale-in at
 * 1180ms via `landing-dot-in`); a mono-caps date plus a "Sign in" link
 * on the right, both sharing the caption-color register from the
 * Aperture top-bar vocabulary.
 *
 * Date is computed at request time via `Intl.DateTimeFormat` and
 * formatted as "Weekday · Month Day" (e.g. "Thursday · May 7"). The
 * page is marked `force-dynamic` in `app/page.tsx` so the date stays
 * fresh per request.
 */
export function LandingTopbar() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    now,
  );
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(now);
  const dateLabel = `${weekday} · ${monthDay}`;

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
        <span>{dateLabel}</span>
        <Link
          href="/login"
          className="transition-colors duration-[180ms] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}
