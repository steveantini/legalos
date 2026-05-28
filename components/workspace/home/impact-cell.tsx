import Link from "next/link";

type ImpactCellBase = {
  /** Eyebrow text; rendered uppercased + tracked by the wrapper. */
  label: string;
};

type ImpactCellValueProps = ImpactCellBase & {
  mode: "value";
  /** Pre-formatted, e.g. "23" or "$14,235". */
  value: string;
  /** Optional unit, e.g. "hrs". */
  suffix?: string;
  /** Optional change line, e.g. "+12 vs last month". */
  delta?: string;
};

type ImpactCellTextProps = ImpactCellBase & {
  mode: "text";
  /** Primary line, e.g. an agent name. */
  primary: string;
  /** Secondary line, e.g. "14 runs this month". */
  secondary?: string;
};

type ImpactCellSetupProps = ImpactCellBase & {
  mode: "setup-needed";
  /** Where "Set up →" routes; omitted for non-admins, who see no link. */
  ctaHref?: string;
  /**
   * Discriminating accessible name for the link — the visible "Set up →"
   * is identical across cells, so each passes its own label (e.g. "Set up
   * hours saved tracking"). Applied only when `ctaHref` is present.
   */
  ariaLabel?: string;
};

type ImpactCellProps =
  | ImpactCellValueProps
  | ImpactCellTextProps
  | ImpactCellSetupProps;

/**
 * One cell of the impact band. Three modes: `value` (a big number with an
 * optional unit and delta), `text` (a primary/secondary label
 * pair, used for Top agent), and `setup-needed` (a reduced-weight
 * placeholder with a "Set up →" link, used for cells awaiting the
 * calculator's task book). The mono caption label is shared across all
 * three.
 */
export function ImpactCell(props: ImpactCellProps) {
  return (
    <div className="px-6 py-3">
      <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-caption">
        {props.label}
      </p>
      {props.mode === "value" && <ValueCell {...props} />}
      {props.mode === "text" && <TextCell {...props} />}
      {props.mode === "setup-needed" && <SetupNeededCell {...props} />}
    </div>
  );
}

function ValueCell({ value, suffix, delta }: ImpactCellValueProps) {
  return (
    <>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-[28px] font-normal leading-none tracking-[-0.025em] text-foreground tabular-nums">
          {value}
        </span>
        {suffix && (
          <span className="font-mono text-[14px] font-medium text-caption">
            {suffix}
          </span>
        )}
      </div>
      {delta && <p className="text-[11.5px] font-medium text-primary">{delta}</p>}
    </>
  );
}

function TextCell({ primary, secondary }: ImpactCellTextProps) {
  return (
    <>
      <p className="mb-1.5 text-[20px] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
        {primary}
      </p>
      {secondary && (
        <p className="font-mono text-[11.5px] text-caption">{secondary}</p>
      )}
    </>
  );
}

function SetupNeededCell({ ctaHref, ariaLabel }: ImpactCellSetupProps) {
  return (
    <>
      <p className="mb-2 text-[20px] font-medium leading-[1.2] tracking-[-0.015em] text-muted-foreground">
        Setup needed
      </p>
      {ctaHref && (
        <Link
          href={ctaHref}
          aria-label={ariaLabel}
          className="text-[12px] font-medium text-primary hover:underline"
        >
          Set up →
        </Link>
      )}
    </>
  );
}
