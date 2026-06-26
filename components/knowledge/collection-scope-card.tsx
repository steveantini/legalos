import { cn } from "@/lib/utils";

/**
 * One collection card in the SCOPE zone, shared by Research and Structured Query
 * so the two surfaces are true siblings: one card treatment (name, doc count,
 * and the source path in plain sans, never monospace). They differ only where
 * they must. Research selects many (checkbox) and shows no fields; Structured
 * Query selects one (radio) and carries its tracked-field pills INSIDE this same
 * card (the merge that retired the old separate "tracks these fields" box, so
 * the collection and what it tracks read as one composed element).
 */
export function CollectionScopeCard({
  name,
  documentCount,
  provenance,
  fields,
  selected,
  onSelect,
  inputType,
  inputName,
  title,
}: {
  name: string;
  documentCount: number;
  provenance: string[];
  /** Tracked-field labels, shown as quiet pills inside the card (Structured
   * Query only). Omitted for Research, which has no fields concept. */
  fields?: string[];
  selected: boolean;
  onSelect: () => void;
  inputType: "checkbox" | "radio";
  /** Radio group name, so single-select cards share a group. */
  inputName?: string;
  title?: string;
}) {
  return (
    <label
      title={title}
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-lg border px-4 py-3 transition-colors duration-hover ease-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring motion-reduce:transition-none",
        selected
          ? "border-hairline-strong bg-secondary"
          : "border-hairline bg-paper-2 hover:bg-secondary",
      )}
    >
      <input
        type={inputType}
        name={inputName}
        className="sr-only"
        checked={selected}
        onChange={onSelect}
      />
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13.5px] font-medium text-foreground">
          {name}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
          {documentCount} {documentCount === 1 ? "doc" : "docs"}
        </span>
      </span>
      {/* The source path in normal sans (the transparency rule, always present);
          monospace made it read like a debug string. */}
      {provenance.map((path) => (
        <span
          key={path}
          className="block truncate text-[11.5px] leading-[1.5] text-caption"
        >
          {path}
        </span>
      ))}
      {fields && fields.length > 0 ? (
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {fields.map((field) => (
            <span
              key={field}
              className="rounded-md border border-hairline bg-card px-2 py-0.5 text-[12px] text-foreground"
            >
              {field}
            </span>
          ))}
        </span>
      ) : null}
    </label>
  );
}
