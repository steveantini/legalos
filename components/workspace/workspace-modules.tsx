import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

/**
 * Static list of secondary product modules (Knowledge / Workflows /
 * Integrations / Help), mirroring the Session 31 rail taxonomy. Each
 * entry carries an explicit `href` because the four categories route
 * to a mix of coming-soon URLs (Knowledge's first leaf is "Research"
 * at `/workspace/coming-soon/knowledge-research`) and real top-level
 * placeholder routes (Workflows / Integrations / Help — which render
 * the centered coming-soon template inline per D-048). When a category
 * gets real shippable surface, its row's `href` swaps to the canonical
 * destination without changing the row's shape.
 */
const MODULES: ReadonlyArray<{
  href: string;
  label: string;
  description: string;
}> = [
  {
    href: "/workspace/coming-soon/knowledge-research",
    label: "Knowledge",
    description:
      "Research grounded in firm corpus, web, and trusted legal sources",
  },
  {
    href: "/workspace/workflows",
    label: "Workflows",
    description: "Multi-step agentic sequences you can author and reuse",
  },
  {
    href: "/workspace/integrations",
    label: "Integrations",
    description: "Connect operational systems via MCP",
  },
  {
    href: "/workspace/help",
    label: "Help",
    description: "Guides, walkthroughs, and product references",
  },
];

/**
 * Secondary "More in legalOS" section on the workspace landing — four
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
          <li key={m.href}>
            <Link
              href={m.href}
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
