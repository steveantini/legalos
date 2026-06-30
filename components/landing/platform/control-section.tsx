import { AppWindow, Mono } from "./platform-chrome";
import { AdminSurface } from "./platform-surfaces";

/**
 * "Control on your terms": a three-facet flexibility strip
 * (model-agnostic, connect your drives, governed by default) followed by the
 * full-width backend admin window. Sits on the recessed paper2 ground to
 * separate it from the platform section. Recreated from the settled prototype
 * (docs/design/landing/).
 */

const FACETS: { tag: string; title: string; body: string; chips: string[] }[] =
  [
    {
      tag: "MODEL-AGNOSTIC",
      title: "Run on the models you choose",
      body: "Managed through legalOS, or bring your own provider account under your own agreement and data boundary. No single engine wired in.",
      chips: ["Claude", "Gemini", "GPT", "Open Weight", "Your key"],
    },
    {
      tag: "CONNECT YOUR DRIVES",
      title: "Point it at the drives you use",
      body: "Ask across folders in the drives you already use. Files are never moved, and their contents are never stored, only a metadata inventory.",
      chips: ["Google Drive", "OneDrive", "Box"],
    },
    {
      tag: "GOVERNED BY DEFAULT",
      title: "Reads free, writes pause for you",
      body: "Every action that changes something outside legalOS pauses for approval, in every autonomy mode. Credentials are encrypted, never in the browser.",
      chips: ["SSO", "Role-based access", "Audit log"],
    },
  ];

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-2 font-sans text-[12.5px] font-normal leading-none text-ink-2">
      {children}
    </span>
  );
}

function Facet({ tag, title, body, chips }: (typeof FACETS)[number]) {
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <Mono className="text-[11px] tracking-[0.18em] text-primary">{tag}</Mono>
      <h3 className="font-sans text-[21px] font-[450] leading-[1.2] tracking-[-0.02em] text-foreground">
        {title}
      </h3>
      <p className="max-w-[36ch] font-sans text-[14.5px] font-normal leading-[1.6] text-muted-foreground">
        {body}
      </p>
      {/* Capped to the body-text width so the chips wrap to match the
          paragraph above them instead of running on one line past the text
          column. max-w plus flex-wrap is what forces the wrap. */}
      <div className="mt-0.5 flex max-w-[34ch] flex-wrap gap-2">
        {chips.map((chip) => (
          <Chip key={chip}>{chip}</Chip>
        ))}
      </div>
    </div>
  );
}

export function ControlSection() {
  return (
    <section className="border-t border-hairline bg-paper-2 px-6 pb-[84px] pt-[76px] min-[720px]:px-10">
      {/* Same uniform scale-down as the platform section (see its note): zoom
          the inner content, keep the padding on the section so the left edge
          stays aligned with the hero. */}
      <div
        className="flex max-w-[1340px] flex-col gap-[52px]"
        style={{ zoom: 0.85 }}
      >
        <div className="flex max-w-[820px] flex-col gap-4">
          <Mono className="text-[11px] tracking-[0.2em] text-primary">
            CONTROL ON YOUR TERMS
          </Mono>
          <h2 className="max-w-[22ch] font-sans text-[42px] font-normal leading-[1.08] tracking-[-0.03em] text-foreground">
            Meets your department{" "}
            <span className="font-medium text-primary">
              where it already is
            </span>
            .
          </h2>
          <p className="max-w-[54ch] font-sans text-[17px] font-normal leading-[1.55] text-muted-foreground">
            Model-agnostic, drive-agnostic, and governed by default. legalOS runs
            on the models you choose, reaches the systems you already run, and
            gives whoever runs it real control.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 min-[860px]:grid-cols-3 min-[860px]:gap-12">
          {FACETS.map((facet) => (
            <Facet key={facet.tag} {...facet} />
          ))}
        </div>

        <div className="flex flex-col gap-8">
          <div className="flex max-w-[44ch] flex-col items-start gap-4 text-left">
            <Mono className="text-[11px] tracking-[0.2em] text-primary">
              THE BACKEND
            </Mono>
            <h3 className="font-sans text-[28px] font-normal leading-[1.14] tracking-[-0.025em] text-foreground">
              Built for the people who run it
            </h3>
            <p className="max-w-[52ch] font-sans text-[16px] font-normal leading-[1.6] text-muted-foreground">
              One control center to govern access and measure adoption, on real,
              measured usage. Least-privilege roles, per-connection permissions,
              and a readable audit log of every change.
            </p>
          </div>
          <AppWindow rail="admin" active="admin" crumbs={["Admin"]} compact>
            <AdminSurface />
          </AppWindow>
        </div>
      </div>
    </section>
  );
}
