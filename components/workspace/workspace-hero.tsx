import type { ReactNode } from "react";

/**
 * Hero block of the Aperture Workspace landing.
 *
 * Two variants (Session 21 — simplified):
 *
 *   - `welcome`   — first-login experience. Lead reads
 *     "Welcome to legalOS, the operating system for legal departments."
 *     with "legalOS" highlighted in slate-blue at weight 500.
 *   - `returning` — return-login experience. Lead drops the
 *     "Welcome to" prefix:
 *     "legalOS, the operating system for legal departments."
 *     Same slate-blue accent on "legalOS"; same display weight on
 *     the rest. No time-of-day greeting, no user name.
 *
 * Both variants share the SAME default subline:
 *
 *     "Your team's agents, knowledge, matters, and resources, all in one place."
 *
 * The `subline` prop overrides the default when provided — used by
 * the workspace landing's empty-departments branch to swap in the
 * Session 20 mailto-request-access CTA. When no override is passed,
 * both variants render the default copy.
 *
 * Renders the small mono "WORKSPACE" caption in both variants. The
 * Aperture spec also calls for three right-aligned stats (Open / SLA
 * at risk / Saved · MTD) — hidden in this build per the phantom-data
 * scope rules (Session 9e).
 */

const DEFAULT_SUBLINE =
  "Your team's agents, knowledge, matters, and resources, all in one place.";

const captionLabel =
  "mb-[14px] font-mono text-[11px] uppercase tracking-[0.16em] text-primary";

const headingClass =
  "max-w-[28ch] text-[52px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground";

const sublineClass =
  "mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground";

interface WorkspaceHeroProps {
  variant: "welcome" | "returning";
  /**
   * Optional subline override. When omitted, both variants render
   * `DEFAULT_SUBLINE`. When provided (e.g., the empty-state mailto
   * CTA), the override replaces the default copy entirely.
   */
  subline?: ReactNode;
}

export function WorkspaceHero({ variant, subline }: WorkspaceHeroProps) {
  return (
    <section className="flex items-end justify-between gap-6">
      <div>
        <p className={captionLabel}>Workspace</p>
        <h1 className={headingClass}>
          {variant === "welcome" ? <>Welcome to </> : null}
          <span className="font-medium text-primary">legalOS</span>, the
          operating system for legal departments.
        </h1>
        <p className={sublineClass}>{subline ?? DEFAULT_SUBLINE}</p>
      </div>
      {/* Stats column hidden per phantom-data scope rules. */}
    </section>
  );
}
