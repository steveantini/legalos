import Link from "next/link";

/**
 * Login surface top bar (Session 23).
 *
 * Server component. Brand wordmark only — no nav, no CTA, no date
 * label. Mirrors the landing topbar's brand-mark vocabulary (dot +
 * wordmark, identical typography and padding) so the two surfaces
 * read as the same product. The wordmark wraps a Link to "/" so a
 * stray click on the brand returns the user to the marketing
 * landing rather than reloading the login page.
 *
 * The brand dot reuses `landing-dot-in` for the entrance animation;
 * the wordmark itself fades with the parent `landing-stage-in` on
 * the page wrapper.
 */
export function LoginTopbar() {
  return (
    <header className="flex items-center px-6 pt-[22px] min-[720px]:px-10 min-[720px]:pt-[28px]">
      <Link
        href="/"
        className="flex items-center gap-[10px] text-[15px] font-semibold tracking-[-0.015em] text-foreground transition-colors duration-[180ms] hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className="landing-dot-in inline-block h-[7px] w-[7px] rounded-full bg-primary"
        />
        legalOS
      </Link>
    </header>
  );
}
