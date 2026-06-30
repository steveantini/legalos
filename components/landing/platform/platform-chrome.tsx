import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

/**
 * Marketing landing, "below the hero" product windows: the idealized app
 * chrome (rail + breadcrumb top bar + surface) that frames each surface
 * preview. Recreated at high fidelity from the settled design prototype
 * (docs/design/landing/), in the real Aperture tokens. These are STATIC
 * marketing visuals, not live app embeds: the rails and breadcrumbs are
 * presentational mirrors of the shipping chrome, not the prefs-coupled
 * server rail. See docs/design/landing/README.md.
 */

/** Mono-caps eyebrow, the product's signature label motif (Geist Mono). */
export function Mono({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono font-medium uppercase tracking-[0.16em] text-caption",
        className,
      )}
    >
      {children}
    </span>
  );
}

function BrandRow() {
  return (
    <div className="flex items-center gap-[10px] rounded-md px-2 pb-1.5 pt-0.5">
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-primary" />
      <Wordmark className="text-[15px] font-semibold tracking-[-0.015em]" />
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="grid size-[30px] shrink-0 place-items-center rounded-full bg-foreground font-sans text-[11px] font-medium text-primary-foreground">
      {initials}
    </div>
  );
}

function NavCaption({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 px-2">
      <Mono className="text-[10.5px] tracking-[0.16em] text-caption">
        {children}
      </Mono>
    </div>
  );
}

function NavRow({
  children,
  active = false,
  count,
}: {
  children: ReactNode;
  active?: boolean;
  count?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg px-2.5 py-[7px]",
        active ? "bg-foreground text-primary-foreground" : "text-ink-2",
      )}
    >
      <span
        className={cn(
          "text-[13px] leading-[1.2] tracking-[-0.005em]",
          active ? "font-medium" : "font-normal",
        )}
      >
        {children}
      </span>
      {count ? (
        <span
          className={cn(
            "font-mono text-[9px] tracking-[0.06em] tabular-nums",
            active ? "text-primary-foreground/70" : "text-caption",
          )}
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

function PersonaBlock({
  initials,
  name,
  role,
}: {
  initials: string;
  name: string;
  role: string;
}) {
  return (
    <div className="mt-auto flex items-center gap-[10px] border-t border-hairline p-2">
      <Avatar initials={initials} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[12.5px] font-medium leading-[1.1] text-foreground">
          {name}
        </span>
        <Mono className="text-[9px] tracking-[0.08em] text-caption">{role}</Mono>
      </div>
    </div>
  );
}

const RAIL_BASE =
  "flex w-[196px] shrink-0 flex-col gap-5 self-stretch border-r border-hairline bg-background px-3 py-5";

/**
 * Workspace rail (presentational mirror of the shipping WorkspaceRail).
 * Mirrors the real structure: a bare top-level Home, then the practice areas
 * listed under a DEPARTMENTS section heading (truncated for height), then the
 * Knowledge / Workflows / Help sections.
 */
function WorkspaceRailMock({ active }: { active: PlatformActive }) {
  const practiceAreas = [
    "Commercial",
    "Corporate",
    "Privacy",
    "Litigation",
    "Regulatory",
  ];
  return (
    <nav className={RAIL_BASE} aria-hidden>
      <BrandRow />
      <div className="flex flex-col gap-[3px]">
        <NavRow active={active === "home"}>Home</NavRow>
      </div>
      <div className="flex flex-col gap-[3px]">
        <NavCaption>Departments</NavCaption>
        {practiceAreas.map((area) => (
          <NavRow
            key={area}
            active={active === "departments" && area === "Commercial"}
          >
            {area}
          </NavRow>
        ))}
      </div>
      <div className="flex flex-col gap-[3px]">
        <NavCaption>Knowledge</NavCaption>
        <NavRow active={active === "knowledge"}>Research</NavRow>
        <NavRow active={active === "knowledge-sq"}>Structured Query</NavRow>
      </div>
      <div className="flex flex-col gap-[3px]">
        <NavCaption>Workflows</NavCaption>
        <NavRow active={active === "workflows"}>My Workflows</NavRow>
      </div>
      <div className="flex flex-col gap-[3px]">
        <NavCaption>Help</NavCaption>
        <NavRow>Guides</NavRow>
      </div>
      <PersonaBlock initials="OB" name="Olivia Bellini" role="General Counsel" />
    </nav>
  );
}

/**
 * Admin rail (presentational mirror of the shipping AdminRail): GOVERN and
 * MEASURE groups with the real items, the ADMIN · OWNER persona.
 */
function AdminRailMock({ active }: { active: PlatformActive }) {
  return (
    <nav className={RAIL_BASE} aria-hidden>
      <BrandRow />
      <div className="flex flex-col gap-[3px]">
        <NavRow active={active === "admin"}>Admin</NavRow>
      </div>
      <div className="flex flex-col gap-[3px]">
        <NavCaption>Govern</NavCaption>
        <NavRow active={active === "people"}>People</NavRow>
        <NavRow active={active === "policy"}>Policy &amp; access</NavRow>
        <NavRow active={active === "audit"}>Audit log</NavRow>
      </div>
      <div className="flex flex-col gap-[3px]">
        <NavCaption>Measure</NavCaption>
        <NavRow active={active === "insights"}>Insights</NavRow>
        <NavRow active={active === "productivity"}>Productivity</NavRow>
        <NavRow active={active === "evals"}>Evals</NavRow>
      </div>
      <PersonaBlock initials="JM" name="Jack Maddox" role="Admin · Owner" />
    </nav>
  );
}

function TopBar({ crumbs }: { crumbs: string[] }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-5 border-b border-hairline px-6">
      <div className="flex items-center gap-[9px]">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={crumb} className="flex items-center gap-[9px]">
              {i > 0 ? (
                <span className="font-sans text-[13px] text-hairline-strong">
                  /
                </span>
              ) : null}
              <span
                className={cn(
                  "font-sans text-[13px] leading-none",
                  isLast
                    ? "font-medium text-foreground"
                    : "font-normal text-muted-foreground",
                )}
              >
                {crumb}
              </span>
            </span>
          );
        })}
      </div>
      <span className="ml-auto font-mono text-[11px] tracking-[0.06em] text-caption">
        Monday · Jun 29
      </span>
    </div>
  );
}

export type PlatformActive =
  | "home"
  | "departments"
  | "knowledge"
  | "knowledge-sq"
  | "workflows"
  | "admin"
  | "people"
  | "policy"
  | "audit"
  | "insights"
  | "productivity"
  | "evals";

/**
 * The full product window: a chrome panel wrapping rail + breadcrumb top bar
 * + the surface. Deep layered shadow and 16px radius per the prototype.
 */
export function AppWindow({
  active,
  crumbs,
  rail = "workspace",
  compact = false,
  children,
}: {
  active: PlatformActive;
  crumbs: string[];
  rail?: "workspace" | "admin";
  /** A shorter window with tighter main padding, for the backend beat. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-2xl border border-hairline-strong bg-background shadow-[0_1px_2px_rgba(26,24,22,0.04),0_2px_8px_-2px_rgba(26,24,22,0.05),0_50px_80px_-44px_rgba(40,52,80,0.34)]",
        compact ? "min-h-[300px]" : "min-h-[440px]",
      )}
    >
      {rail === "admin" ? (
        <AdminRailMock active={active} />
      ) : (
        <WorkspaceRailMock active={active} />
      )}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TopBar crumbs={crumbs} />
        <div
          className={cn(
            "min-w-0 flex-1 px-7",
            compact ? "py-4" : "pb-[30px] pt-[26px]",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
