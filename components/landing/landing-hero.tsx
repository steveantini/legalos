import Link from "next/link";

import { LandingGlyph } from "./landing-glyph";

/**
 * Marketing landing hero (Session 22 Step B).
 *
 * Server component. Eyebrow → four-line headline → subline → CTA row,
 * each entering with a per-element animation delay so the hero
 * choreographs in stages over ~3.3s on first paint:
 *
 *   eyebrow   (landing-el-up)   1500ms
 *   line 1    (landing-line-up) 1700ms
 *   line 2    (landing-line-up) 1820ms
 *   line 3    (landing-line-up) 1940ms
 *   line 4    (landing-line-up) 2060ms
 *   subline   (landing-el-up)   2700ms
 *   CTA row   (landing-el-in)   3300ms
 *
 * Each headline line is a typewriter-style mask: an outer span with
 * `landing-line-mask` clip-paths the box during the slide; a delayed
 * `landing-line-unmask` keyframe at 3060ms releases the clip so
 * descenders aren't permanently clipped after the choreography ends.
 */
export function LandingHero({ isSignedIn }: { isSignedIn: boolean }) {
  // State-aware primary CTA (D-171): "Enter workspace" for a signed-in visitor,
  // "Sign in" for a signed-out one. Replaces the former top-right sign-in link.
  const ctaHref = isSignedIn ? "/workspace" : "/login";
  const ctaLabel = isSignedIn ? "Enter workspace" : "Sign in";

  return (
    <section className="relative flex flex-col items-start px-6 pb-20 pt-[80px] min-[720px]:px-10 min-[720px]:pb-[120px] min-[720px]:pt-[120px]">
      <div className="flex max-w-[1140px] flex-col gap-[14px]">
        <p
          className="landing-el-up font-mono text-[11px] uppercase tracking-[0.16em] text-primary"
          style={{ animationDelay: "1500ms" }}
        >
          BETA · <span style={{ textTransform: "none" }}>v0.1.0</span>
        </p>

        <h1
          className="text-[44px] font-normal leading-[1.04] tracking-[-0.03em] text-foreground min-[720px]:text-[64px]"
          style={{ maxWidth: "36ch", textWrap: "balance" }}
        >
          <span className="landing-line-mask block pb-[0.18em]">
            <span
              className="landing-line-up block"
              style={{ animationDelay: "1700ms" }}
            >
              Welcome to{" "}
              <span className="font-medium text-primary">legalOS</span>,
            </span>
          </span>
          <span className="landing-line-mask block pb-[0.18em]">
            <span
              className="landing-line-up block"
              style={{ animationDelay: "1830ms" }}
            >
              your connected workspace and
            </span>
          </span>
          <span className="landing-line-mask block pb-[0.18em]">
            <span
              className="landing-line-up block"
              style={{ animationDelay: "1960ms" }}
            >
              legal department operating system.
            </span>
          </span>
        </h1>

        <p
          className="landing-el-up mt-[14px] max-w-[56ch] text-[16px] font-normal leading-[1.55] text-muted-foreground"
          style={{ animationDelay: "2700ms" }}
        >
          One place for the agents, workflows, and tools your team uses every
          day, built around how legal work actually happens.
        </p>

        <div
          className="landing-el-in mt-9 flex items-center gap-[18px]"
          style={{ animationDelay: "3300ms" }}
        >
          <Link
            href={ctaHref}
            className="group inline-flex items-center gap-[10px] rounded-[12px] bg-foreground py-4 pl-[26px] pr-[22px] text-[15px] font-medium text-background shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_0_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.12)] transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-px hover:bg-ink-2 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_0_rgba(0,0,0,0.16),0_14px_36px_rgba(0,0,0,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {ctaLabel}
            <svg
              aria-hidden
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-200 ease-out group-hover:translate-x-[3px]"
            >
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </Link>

          <a
            href="mailto:steveantini@gmail.com"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-caption transition-colors duration-[180ms] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[719px]:hidden"
          >
            Request access{" "}
            <span className="normal-case tracking-[0.02em] text-primary">→</span>
          </a>
        </div>
      </div>
      <LandingGlyph />
    </section>
  );
}
