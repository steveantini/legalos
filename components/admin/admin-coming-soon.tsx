import { captionLabel } from "@/lib/workspace/rail-styles";

/**
 * Coming-soon stub for an admin area (Admin polish arc, A1). The four areas
 * (People, Policy & access, Insights, Evals) are real future destinations whose
 * functionality lands in later milestones; until then their routes render this.
 *
 * Unlike the settings Profile/Display stubs (which use `ComingSoonContent`, a
 * centered surface that owns its own `<main>`), this renders a fragment inside
 * the admin layout's `<main>` — nesting two `<main>` landmarks would be invalid.
 * It also leads with the area's own 44px title (the canonical page-title family
 * shared by workspace, departments, and settings) rather than a generic
 * "Coming soon." headline, so the area reads as a named, considered destination
 * that simply isn't built yet. Honest-state discipline: the editorial line says
 * what the area will do; a quiet caption marks it as not yet live.
 */
export function AdminComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          {title}
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          {description}
        </p>
      </header>

      <div className="mt-10 border-t border-hairline pt-6">
        <p className={captionLabel}>Coming soon</p>
        <p className="mt-2 max-w-[60ch] text-[13.5px] leading-[1.5] text-caption">
          This area is part of the admin build and arrives in an upcoming
          milestone.
        </p>
      </div>
    </>
  );
}
