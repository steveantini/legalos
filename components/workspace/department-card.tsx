import Link from "next/link";

import type { AccessibleDepartment } from "@/lib/auth/access";

/**
 * One department card in the Aperture Workspace grid.
 *
 * The entire card is a Next `<Link>` — clicking anywhere on the surface
 * navigates to `/departments/<slug>`. The arrow circle on the right of
 * the foot is decorative (`aria-hidden`); the link's `aria-label`
 * carries the meaning for assistive tech.
 *
 * Hover state per Aperture spec: lift `-2px`, border darkens, shadow
 * grows, arrow circle inverts (paper bg → ink bg, ink color → paper
 * color, with a small `translateX(2px)`). All transitions are
 * `220ms cubic-bezier(.2,.7,.2,1)` for the card and `200ms ease` for
 * the arrow per the source CSS.
 *
 * Hover border `#d8d2c7` is between `--hairline` and `--hairline-strong`
 * — close enough to `--hairline-strong` (`#e3ddd1`) that we use that
 * token for the hover border rather than introducing a fourth stone
 * variant just for this case. The visible difference at card scale is
 * minor; if it matters we can add a `--hairline-darker` later.
 *
 * Per the phantom-data scope rules (Session 9e), the foot's left text
 * is "{N} agent(s)" derived from real DB count, not the spec's
 * "{count} reviews · {savedH}h saved" placeholder.
 */
export function DepartmentCard({
  department,
  agentCount,
}: {
  department: AccessibleDepartment;
  agentCount: number;
}) {
  const agentLabel = agentCount === 1 ? "1 agent" : `${agentCount} agents`;

  return (
    <Link
      href={`/departments/${department.slug}`}
      aria-label={`Open ${department.name} workspace`}
      className="group relative flex min-h-[192px] flex-col gap-4 rounded-[14px] border border-card-border bg-card p-[22px] shadow-[0_1px_0_rgba(26,24,22,0.02),0_1px_3px_rgba(26,24,22,0.04),0_8px_24px_-8px_rgba(26,24,22,0.06)] transition-[transform,box-shadow,border-color] duration-[220ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-[2px] hover:border-primary/35 hover:shadow-[0_1px_0_rgba(26,24,22,0.03),0_4px_8px_rgba(26,24,22,0.06),0_22px_38px_-12px_rgba(26,24,22,0.12),0_8px_24px_-8px_rgba(59,86,128,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <h3 className="text-[19px] font-medium leading-[1.15] tracking-[-0.018em] text-foreground">
        {department.name}
      </h3>
      <p className="flex-1 text-[13px] leading-[1.45] text-muted-foreground">
        {department.description ?? ""}
      </p>
      <div className="flex items-center justify-between border-t border-card-divider pt-3 font-mono text-[11px] tabular-nums text-caption">
        <span>{agentLabel}</span>
        <span
          aria-hidden
          className="grid h-[22px] w-[22px] place-items-center rounded-full bg-background text-foreground transition-[background,color,transform] duration-200 ease-out group-hover:translate-x-[2px] group-hover:bg-foreground group-hover:text-background"
        >
          →
        </span>
      </div>
    </Link>
  );
}
