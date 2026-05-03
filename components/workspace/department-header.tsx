/**
 * Page header for a department launchpad — the Aperture-vocabulary
 * equivalent of the landing's `<WorkspaceHero>` h1+subline shape, minus
 * the small "WORKSPACE" caption label and the bolded-phrase parser.
 *
 * Typography matches the landing's hero:
 *   - h1: Inter Tight 52px / 400 / -0.03em / 1.02 / max 22ch / ink
 *   - subline: 14.5px / 1.5 / max 56ch / mute
 *
 * Description is nullable in the schema; renders the h1 alone when null.
 */
export function DepartmentHeader({
  name,
  description,
}: {
  name: string;
  description: string | null;
}) {
  return (
    <header>
      <h1 className="max-w-[22ch] text-[52px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
        {name}
      </h1>
      {description ? (
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
