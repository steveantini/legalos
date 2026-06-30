import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

import { AppWindow, Mono, type PlatformActive } from "./platform-chrome";
import {
  DepartmentsSurface,
  KnowledgeSurface,
  WorkflowsSurface,
  WorkspaceSurface,
} from "./platform-surfaces";

/**
 * "Inside the platform": four alternating rows, each pairing a short
 * label/description with a full idealized product window (rail + breadcrumb +
 * surface). Recreated from the settled prototype (docs/design/landing/).
 *
 * Responsive: the single breakpoint is 1180px. Above it, rows are two columns
 * with alternating sides (even: window left, text right; odd: text left,
 * window right, text right-aligned). At or below it, every row collapses to a
 * single column with the text ABOVE the window, left-aligned.
 */

type Area = {
  num: string;
  eyebrow: string;
  title: string;
  desc: string;
  active: PlatformActive;
  crumbs: string[];
  Surface: ComponentType;
};

const AREAS: Area[] = [
  {
    num: "01",
    eyebrow: "WORKSPACE",
    title: "The daily home",
    desc: "Your day, the moment you sit down: today's schedule, the impact your team is seeing, and the reading you follow. Everything in one place.",
    active: "home",
    crumbs: ["Home"],
    Surface: WorkspaceSurface,
  },
  {
    num: "02",
    eyebrow: "DEPARTMENTS",
    title: "Agents, organized like your team",
    desc: "AI agents arranged by the practice areas you already run, each in clearly marked tiers your team can trust at a glance.",
    active: "departments",
    crumbs: ["Departments"],
    Surface: DepartmentsSurface,
  },
  {
    num: "03",
    eyebrow: "KNOWLEDGE",
    title: "Ask your own documents",
    desc: "Two ways to ask: Research reads and reasons over your documents, and Structured Query answers exactly, the same way every time. The precision you can verify.",
    active: "knowledge-sq",
    crumbs: ["Knowledge", "Structured Query"],
    Surface: KnowledgeSurface,
  },
  {
    num: "04",
    eyebrow: "WORKFLOWS",
    title: "Work that waits for you",
    desc: "Multi-step legal work, built without code. It runs on its own, but every step that changes something pauses for a person to approve.",
    active: "workflows",
    crumbs: ["Workflows", "Review an inbound NDA"],
    Surface: WorkflowsSurface,
  },
];

function AreaText({ area, reversed }: { area: Area; reversed: boolean }) {
  return (
    <div
      className={cn(
        "order-1 flex flex-col items-start gap-4 text-left",
        reversed
          ? "min-[1181px]:order-1 min-[1181px]:items-end min-[1181px]:text-right"
          : "min-[1181px]:order-2",
      )}
    >
      <span className="inline-flex items-center gap-3">
        <Mono className="text-[11px] tracking-[0.12em] text-caption">
          {area.num}
        </Mono>
        <span className="h-px w-[22px] bg-hairline-strong" />
        <Mono className="text-[11px] tracking-[0.2em] text-primary">
          {area.eyebrow}
        </Mono>
      </span>
      <h3 className="max-w-[15ch] font-sans text-[28px] font-normal leading-[1.14] tracking-[-0.025em] text-foreground">
        {area.title}
      </h3>
      <p className="max-w-[38ch] font-sans text-[15px] font-normal leading-[1.6] text-muted-foreground">
        {area.desc}
      </p>
    </div>
  );
}

export function PlatformSection() {
  return (
    <section className="border-t border-hairline px-6 pb-[84px] pt-[76px] min-[720px]:px-10">
      <div className="flex max-w-[1340px] flex-col gap-[60px]">
        <div className="flex max-w-[900px] flex-col gap-4">
          <Mono className="text-[11px] tracking-[0.2em] text-primary">
            INSIDE THE PLATFORM
          </Mono>
          <h2 className="max-w-[24ch] font-sans text-[42px] font-normal leading-[1.08] tracking-[-0.03em] text-foreground">
            Everything your department runs on, in{" "}
            <span className="font-medium text-primary">one place</span>.
          </h2>
          <p className="max-w-[58ch] font-sans text-[16px] font-normal leading-[1.55] text-muted-foreground">
            Your workspace, your departments, your knowledge, and your
            workflows. Here is how each one actually works.
          </p>
        </div>

        <div className="flex flex-col gap-16">
          {AREAS.map((area, i) => {
            const reversed = i % 2 === 1;
            return (
              <div
                key={area.num}
                className={cn(
                  "grid grid-cols-1 items-start gap-[30px]",
                  "min-[1181px]:items-center min-[1181px]:gap-[52px]",
                  reversed
                    ? "min-[1181px]:grid-cols-[1fr_1.95fr]"
                    : "min-[1181px]:grid-cols-[1.95fr_1fr]",
                )}
              >
                {/* Text first in DOM, so on collapse (single column) the
                    number + eyebrow + title label always sits ABOVE its window,
                    regardless of order utilities. */}
                <AreaText area={area} reversed={reversed} />
                <div
                  className={cn(
                    "order-2 min-w-0",
                    reversed
                      ? "min-[1181px]:order-2"
                      : "min-[1181px]:order-1",
                  )}
                >
                  <AppWindow active={area.active} crumbs={area.crumbs}>
                    <area.Surface />
                  </AppWindow>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
