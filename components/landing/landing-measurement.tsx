/**
 * Marketing landing measurement section (analytics arc close).
 *
 * Server component. Sits between the hero and the footer as a bordered
 * band, and carries the landing's measurement story: legalOS doesn't
 * just do the work, it shows each person, and the team's leaders, the
 * value the work creates. The closing line draws the same
 * measured-vs-estimated boundary the product's own labeling draws:
 * usage figures are real measured usage; the return is an estimate the
 * customer shapes with their own assumptions.
 *
 * Choreography: the whole band fades in via `landing-el-in` at 3500ms,
 * slotting between the hero CTA (3300ms) and the footer (3700ms) so the
 * cold-load reveal stays strictly top-down. Reusing the shared utility
 * means the return-visit collapse (`[data-arrival="return"]`) and the
 * reduced-motion guard in globals.css both cover it with no new CSS.
 */

const MEASURES = [
  {
    label: "Your impact",
    body: "Each person sees their own impact on their home page: their runs, their most-used agent, and the hours and cost given back.",
  },
  {
    label: "Team adoption",
    body: "Leaders see how the team is adopting legalOS: who’s active, how usage is trending, and where adoption hasn’t reached yet. All of it real, measured usage.",
  },
  {
    label: "Estimated return",
    body: "A built-in calculator estimates your return, combining measured usage with assumptions you control, like salary and time saved per task.",
  },
] as const;

export function LandingMeasurement() {
  return (
    <section
      className="landing-el-in border-t border-hairline-strong px-6 py-16 min-[720px]:mx-10 min-[720px]:px-0 min-[720px]:py-[96px]"
      style={{ animationDelay: "3500ms" }}
    >
      <div className="flex max-w-[1140px] flex-col gap-12">
        <div className="flex flex-col gap-[14px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
            Measurement
          </p>
          <h2
            className="text-[32px] font-normal leading-[1.12] tracking-[-0.025em] text-foreground min-[720px]:text-[40px]"
            style={{ maxWidth: "26ch", textWrap: "balance" }}
          >
            It doesn&rsquo;t just do the work. It{" "}
            <span className="font-medium text-primary">shows you</span> what
            the work is worth.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-10 min-[720px]:grid-cols-3">
          {MEASURES.map((m) => (
            <div key={m.label}>
              <p className="mb-[14px] font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
                {m.label}
              </p>
              <p className="max-w-[40ch] text-[14px] leading-[1.6] text-muted-foreground">
                {m.body}
              </p>
            </div>
          ))}
        </div>

        <p className="max-w-[56ch] text-[14px] leading-[1.6] text-ink-2">
          Usage is measured. The return is an estimate you shape. legalOS
          labels which is which, everywhere it shows a number.
        </p>
      </div>
    </section>
  );
}
