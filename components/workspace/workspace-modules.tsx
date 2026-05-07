import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

/**
 * Static list of secondary product modules (Knowledge / Matters /
 * Resources). All three currently route to `/coming-soon/<slug>`;
 * the rows exist to signal the product's broader IA without faking
 * shippable content. When a section gets real shippable surface,
 * its row swaps `/coming-soon/<slug>` for the real path.
 *
 * Inbox is intentionally absent — dropped from the rail and from
 * this module list as part of the same restructure.
 */
const MODULES: ReadonlyArray<{
  slug: string;
  label: string;
  description: string;
}> = [
  {
    slug: "knowledge",
    label: "Knowledge",
    description: "Department documents and AI-powered research",
  },
  {
    slug: "matters",
    label: "Matters",
    description: "Active matters and pipeline dashboard",
  },
  {
    slug: "resources",
    label: "Resources",
    description: "Org charts, onboarding, training, and reference material",
  },
];

/**
 * Secondary "More in legalOS" section on the workspace landing — three
 * compact list rows below the DepartmentGrid card grid. The shift from
 * cards (above) to list rows (here) IS the visual hierarchy: cards
 * carry primary work surface (Departments → agents → chat), rows
 * carry deferred / future modules.
 *
 * Section heading uses the canonical caption shape from
 * `<DepartmentGrid>`: mono-caps, 11px, weight 500, tracking 0.16em,
 * muted-foreground, with a hairline `border-b border-hairline pb-[10px]`
 * separator. Inner content offsets `mt-[14px]` to match.
 *
 * Each row is a `<Link>` with arrow + label + description inline:
 *   - Arrow: Lucide ArrowRight, 14px, muted-foreground, stroke-width
 *     1.5. Slides 2px right on hover to telegraph the navigation.
 *   - Label: 14px, weight 450 — matches the rail leaf weight from
 *     `linkBase` in `workspace-rail.tsx`.
 *   - Description: 13px, muted-foreground, single line, `truncate` so
 *     a narrow viewport never wraps a row mid-sentence.
 *
 * Hover: full row tints to `bg-paper-2` (canonical "hover row tint"
 * per globals.css) at 180ms ease, and the arrow nudges right.
 * Restraint is intentional — these rows are quiet by design; nothing
 * lifts, nothing glows.
 *
 * Rendered only in the populated branch of the workspace landing —
 * the empty-departments branch keeps its focused request-access
 * mailto state without secondary noise below.
 */
export function WorkspaceModules() {
  return (
    <section>
      <header className="flex items-baseline justify-between border-b border-hairline pb-[10px]">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          More
        </h2>
      </header>
      <ul className="mt-[14px] flex flex-col">
        {MODULES.map((m) => (
          <li key={m.slug}>
            <Link
              href={`/workspace/coming-soon/${m.slug}`}
              className="group flex items-center gap-3 rounded-[10px] px-3 py-[10px] transition-colors duration-[180ms] ease-out hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowRightIcon
                aria-hidden
                strokeWidth={1.5}
                className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-[180ms] ease-out group-hover:translate-x-[2px] group-hover:text-foreground"
              />
              <span className="text-[14px] font-[450] text-foreground">
                {m.label}
              </span>
              <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                {m.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
