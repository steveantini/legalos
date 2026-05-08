"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Decorative landing-page glyph (Session 22 Step B).
 *
 * Client component (Session 22 Step C). A 220x220 mark composed of:
 *
 *   - A soft accent radial-gradient fill on a centered 100r circle.
 *   - Three static reference rings at r=92 / 64 / 36 in primary at
 *     0.18 opacity to anchor the composition.
 *   - A two-phase pulse choreography on the r=92 ring (described
 *     below).
 *   - A centered 6r accent dot.
 *
 * Two-phase pulse — both phases coexist as siblings in the SVG; the
 * "phase switch" is purely about which animation is firing visibly,
 * not about mounts/unmounts:
 *
 *   Opening (0s → ~19.6s):
 *     Three accent-stroked pulse rings sharing the r=92 circle, with
 *     staggered delays 0s / 1.4s / 2.8s, each running the
 *     `landing-ring-pulse-opening` animation (4 finite iterations of
 *     the 4.2s `landing-ring-pulse` cycle). After their iteration
 *     count is exhausted they hold at the final keyframe (opacity 0,
 *     scale 1.05) — invisible. Ring 1 ends ~16.8s, ring 3 ends
 *     ~19.6s. No abrupt unmount.
 *
 *   Settled (20s onward):
 *     A single ring fires the `landing-ring-pulse-once` animation
 *     (~4s expansion) every 5s. The first settled-phase pulse is
 *     gated behind an interval-tick boolean (`hasFiredFirstPulse`)
 *     so nothing renders at the boundary until the timer fires.
 *     Each pulse is a fresh React node (key bumps every 5s) so the
 *     animation restarts cleanly on each tick.
 *
 * The wrapper is positioned absolutely against the relative hero
 * `<section>` in `landing-hero.tsx`; pinned to the right at 40px,
 * vertically centered, `pointer-events-none` so it never intercepts
 * clicks. Hidden under 720px viewport so the headline gets the full
 * width on narrow screens.
 *
 * Reduced-motion: the global CSS guard zeroes all three pulse
 * variants — `landing-ring-pulse`, `landing-ring-pulse-once`, and
 * `landing-ring-pulse-opening` (animation: none, opacity: 0). Users
 * with motion sensitivity see only the static reference rings +
 * center dot regardless of phase.
 */
export function LandingGlyph() {
  const [pulseKey, setPulseKey] = useState(0);
  const [hasFiredFirstPulse, setHasFiredFirstPulse] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        setHasFiredFirstPulse(true);
        setPulseKey((k) => k + 1);
      }, 5000);
    }, 15000);

    return () => {
      clearTimeout(startTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="landing-el-in pointer-events-none absolute right-10 top-1/2 h-[220px] w-[220px] -translate-y-1/2 max-[719px]:hidden"
      style={{
        animationDelay: "1300ms",
        animationDuration: "1200ms",
        animationTimingFunction: "cubic-bezier(.2, .7, .2, 1)",
      }}
    >
      <svg
        viewBox="0 0 220 220"
        width={220}
        height={220}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient
            id="landing-glyph-gradient"
            cx="50%"
            cy="50%"
            r="50%"
          >
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="110" cy="110" r="100" fill="url(#landing-glyph-gradient)" />

        <circle
          cx="110"
          cy="110"
          r="92"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.18"
          strokeWidth="1"
        />
        <circle
          cx="110"
          cy="110"
          r="64"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.18"
          strokeWidth="1"
        />
        <circle
          cx="110"
          cy="110"
          r="36"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.18"
          strokeWidth="1"
        />

        <circle
          cx="110"
          cy="110"
          r="92"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1"
          className="landing-ring-pulse-opening"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animationDelay: "0s",
          }}
        />
        <circle
          cx="110"
          cy="110"
          r="92"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1"
          className="landing-ring-pulse-opening"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animationDelay: "1.4s",
          }}
        />
        <circle
          cx="110"
          cy="110"
          r="92"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1"
          className="landing-ring-pulse-opening"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animationDelay: "2.8s",
          }}
        />

        {hasFiredFirstPulse && (
          <circle
            key={pulseKey}
            cx="110"
            cy="110"
            r="92"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1"
            className="landing-ring-pulse-once"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
          />
        )}

        <circle cx="110" cy="110" r="6" fill="var(--primary)" />
      </svg>
    </div>
  );
}
