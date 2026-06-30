import { DepartmentCard } from "@/components/workspace/department-card";
import { LandingRow } from "@/components/workspace/landing-row";
import type { DepartmentWithAccess } from "@/lib/auth/access";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

import { Mono } from "./platform-chrome";

/**
 * The five surface contents shown inside the marketing product windows
 * (Workspace, Departments, Knowledge, Workflows, Admin). High-fidelity
 * recreations of the settled prototype (docs/design/landing/), in the real
 * Aperture tokens, with final illustrative copy.
 *
 * Reuse vs. rebuild (see the landing build report):
 *  - Departments reuses the real <DepartmentCard/> with mock props.
 *  - Admin mirrors the REAL admin page: the shipping <LandingRow/> and
 *    ADMIN_NAV_GROUPS copy, not the prototype's stat tiles.
 *  - The impact band and the Structured Query answer are presentational
 *    recreations (the production ImpactBandClient / StructuredQueryResultView
 *    carry interactive chrome that reads as dead controls inside a static
 *    marketing visual); they match the prototype exactly.
 */

/* ── shared scalar stat (mirrors the metrics MetricStat) ─────────────── */
function Stat({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
}) {
  return (
    <div>
      <Mono className="text-[10px] tracking-[0.14em] text-caption">{label}</Mono>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-sans text-[28px] font-normal leading-none tracking-[-0.02em] tabular-nums text-foreground">
          {value}
        </span>
        {suffix ? (
          <span className="font-mono text-[13px] font-medium leading-none text-caption">
            {suffix}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5">
        <span className="font-sans text-[11px] font-medium leading-[1.4] tabular-nums text-primary">
          {hint}
        </span>
      </div>
    </div>
  );
}

/* ── 1 · WORKSPACE ───────────────────────────────────────────────────── */
export function WorkspaceSurface() {
  const stats = [
    { label: "HOURS SAVED", value: "34", suffix: "hrs", hint: "this month" },
    {
      label: "EST. COST SAVED",
      value: "$9,400",
      hint: "from this month's usage",
    },
    { label: "AGENT RUNS", value: "128", hint: "this month" },
  ];
  const needs = [
    {
      type: "MSA",
      title: "Acme Master Services Agreement",
      due: "due in 3 days",
    },
    { type: "DPA", title: "Vendor data processing addendum", due: "due Friday" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-sans text-[30px] font-normal leading-[1.04] tracking-[-0.03em] text-foreground">
          Good afternoon, <span className="text-primary">Olivia</span>.
        </h1>
        <p className="max-w-[52ch] font-sans text-[13.5px] font-normal leading-[1.5] text-muted-foreground">
          Welcome back to{" "}
          <strong className="font-medium text-primary">legalOS</strong>, your
          team&rsquo;s departments, knowledge, workflows, and integrations, all
          in one place.
        </p>
      </div>

      {/* impact band */}
      <div>
        <Mono className="ml-0.5 text-[10px] tracking-[0.14em] text-caption">
          YOUR IMPACT · THIS MONTH
        </Mono>
        <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_0_rgba(26,24,22,0.02),0_1px_3px_rgba(26,24,22,0.04),0_8px_24px_-8px_rgba(26,24,22,0.06)]">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                "px-[22px] py-[18px]",
                i > 0 ? "border-l border-card-divider" : "",
              )}
            >
              <Stat {...s} />
            </div>
          ))}
        </div>
      </div>

      {/* needs you */}
      <div>
        <div className="mb-1 flex items-baseline justify-between border-b border-hairline pb-2.5">
          <span className="font-sans text-[14px] font-medium leading-none tracking-[-0.01em] text-foreground">
            Needs you
          </span>
          <span className="font-sans text-[12px] font-medium leading-none text-primary">
            All matters →
          </span>
        </div>
        {needs.map((n) => (
          <div
            key={n.type}
            className="grid grid-cols-[44px_1fr_auto] items-center gap-3.5 rounded-lg px-1.5 py-3 transition-colors duration-150 hover:bg-hairline"
          >
            <span className="inline-flex h-[22px] items-center justify-center rounded-md bg-foreground font-mono text-[9.5px] font-semibold tracking-[0.04em] text-primary-foreground">
              {n.type}
            </span>
            <span className="truncate font-sans text-[13.5px] font-normal leading-[1.25] text-foreground">
              {n.title}
            </span>
            <span className="font-sans text-[12px] font-normal leading-none text-muted-foreground">
              {n.due}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 2 · DEPARTMENTS (reuses the real DepartmentCard) ────────────────── */
type MockDept = { dept: DepartmentWithAccess; count: number };

function mockDept(
  slug: string,
  name: string,
  description: string,
  sortOrder: number,
): DepartmentWithAccess {
  return {
    id: `landing-${slug}`,
    slug,
    name,
    description,
    sort_order: sortOrder,
    hasAccess: true,
  };
}

export function DepartmentsSurface() {
  const depts: MockDept[] = [
    {
      dept: mockDept(
        "commercial",
        "Commercial",
        "Contracts, order forms, and renewals.",
        1,
      ),
      count: 15,
    },
    {
      dept: mockDept(
        "corporate",
        "Corporate",
        "Entities, equity, and governance.",
        2,
      ),
      count: 11,
    },
    {
      dept: mockDept(
        "privacy",
        "Privacy",
        "DPAs, DSARs, and data transfers.",
        3,
      ),
      count: 8,
    },
    {
      dept: mockDept(
        "litigation",
        "Litigation",
        "Holds, disputes, and outside counsel.",
        4,
      ),
      count: 18,
    },
    {
      dept: mockDept(
        "regulatory",
        "Regulatory",
        "Filings, monitoring, and policy.",
        5,
      ),
      count: 7,
    },
    {
      dept: mockDept(
        "employment",
        "Employment",
        "Offers, policies, and separations.",
        6,
      ),
      count: 17,
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-[22px] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
          Departments
        </h1>
        <p className="max-w-[56ch] font-sans text-[13px] font-normal leading-[1.5] text-muted-foreground">
          Practice areas your team works across, each with its agents in clearly
          marked tiers.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3.5">
        {depts.map(({ dept, count }) => (
          <DepartmentCard
            key={dept.slug}
            department={dept}
            agentCount={count}
            canEdit={false}
          />
        ))}
      </div>
    </div>
  );
}

/* ── 3 · KNOWLEDGE (Structured Query active) ─────────────────────────── */
function ToolCard({
  name,
  tag,
  body,
  active = false,
}: {
  name: string;
  tag: string;
  body: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl bg-card px-4 py-3.5",
        active
          ? "border border-primary shadow-[0_8px_24px_-10px_rgba(59,86,128,0.30)]"
          : "border border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-sans text-[13.5px] font-medium leading-none text-foreground">
          {name}
        </span>
        <Mono
          className={cn(
            "text-[9px] tracking-[0.1em]",
            active ? "text-primary" : "text-caption",
          )}
        >
          {tag}
        </Mono>
      </div>
      <span className="font-sans text-[12px] font-normal leading-[1.45] text-muted-foreground">
        {body}
      </span>
    </div>
  );
}

export function KnowledgeSurface() {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-[22px] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
          Knowledge
        </h1>
        <p className="max-w-[56ch] font-sans text-[13px] font-normal leading-[1.5] text-muted-foreground">
          Your documents, searchable in plain language, without moving them.
        </p>
      </div>

      {/* two tools */}
      <div className="grid grid-cols-2 gap-3">
        <ToolCard
          name="Research"
          tag="READS · REASONS"
          body="Read-and-reason answers with citations. Non-deterministic."
        />
        <ToolCard
          name="Structured Query"
          tag="EXACT · REPEATABLE"
          body="Exact, repeatable counts over fields you set up. Deterministic."
          active
        />
      </div>

      {/* question */}
      <div className="rounded-xl border border-hairline bg-paper-2 px-4 py-3.5">
        <Mono className="text-[10px] tracking-[0.08em] text-muted-foreground">
          QUESTION
        </Mono>
        <p className="mt-1 font-sans text-[15px] font-normal leading-[1.5] text-foreground">
          How many agreements expire in 2026?
        </p>
      </div>

      {/* exact answer */}
      <div className="rounded-xl border border-hairline bg-paper-2 px-[18px] py-4">
        <div className="flex items-baseline gap-2">
          <span className="font-sans text-[34px] font-normal leading-none tracking-[-0.02em] tabular-nums text-foreground">
            23
          </span>
          <span className="font-sans text-[14px] font-normal leading-none text-muted-foreground">
            of 1,204 documents
          </span>
        </div>
        <p className="mt-3 font-sans text-[12.5px] font-normal leading-[1.5] text-caption">
          <span className="text-muted-foreground">Interpreted as:</span>{" "}
          expiration date falls in 2026.
        </p>
      </div>

      {/* one matching document, with citation */}
      <div>
        <Mono className="text-[10px] tracking-[0.08em] text-muted-foreground">
          MATCHING DOCUMENTS
        </Mono>
        <div className="mt-2 rounded-[10px] border border-hairline bg-paper-2 px-3.5 py-3">
          <p className="truncate font-sans text-[13px] font-medium leading-[1.3] text-foreground">
            Vendor Master Agreement, Acme Corp
          </p>
          <div className="mt-1.5 font-sans text-[12px] font-normal leading-[1.5]">
            <span className="text-muted-foreground">Expires:</span>{" "}
            <span className="text-foreground">Aug 14, 2026</span>
            <span className="mt-[3px] block border-l-2 border-hairline pl-2 text-caption">
              &ldquo;…shall remain in effect until August 14, 2026…&rdquo;{" "}
              <span className="text-caption">(verified against the source)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 4 · WORKFLOWS (a paused run) ────────────────────────────────────── */
function RunStep({
  kind,
  label,
  title,
  meta,
  last = false,
}: {
  kind: "done" | "approval" | "pending";
  label: string;
  title: string;
  meta: string;
  last?: boolean;
}) {
  const isApproval = kind === "approval";
  const dotTone =
    kind === "approval"
      ? "border-primary bg-primary"
      : kind === "done"
        ? "border-ink-2 bg-ink-2"
        : "border-hairline-strong bg-card";
  return (
    <div className="grid grid-cols-[24px_1fr] gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mt-[3px] grid size-[13px] shrink-0 place-items-center rounded-full border-[1.5px]",
            dotTone,
            isApproval
              ? "shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_8%,transparent)]"
              : "",
          )}
        >
          {kind === "done" ? (
            <span className="font-sans text-[8px] font-bold leading-none text-card">
              ✓
            </span>
          ) : null}
        </span>
        {!last ? (
          <span className="mt-[3px] min-h-[18px] w-[1.5px] flex-1 bg-hairline" />
        ) : null}
      </div>
      {isApproval ? (
        <div className="mb-3.5 overflow-hidden rounded-[10px] border border-primary/[0.18] bg-primary/[0.08]">
          <div className="flex gap-[11px] px-[15px] py-[13px]">
            <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] border-primary font-sans text-[9px] font-semibold leading-none text-primary">
              ?
            </span>
            <div className="min-w-0 flex-1">
              <Mono className="text-[9px] tracking-[0.1em] text-primary">
                {label}
              </Mono>
              <p className="mt-[7px] font-sans text-[13px] font-normal leading-[1.5] text-foreground">
                {title}
              </p>
              <p className="mt-2 border-l-2 border-primary/[0.18] pl-[11px] font-sans text-[13px] font-normal leading-[1.5] text-ink-2">
                {meta}
              </p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-lg bg-foreground px-4 py-[9px] font-sans text-[12.5px] font-medium leading-none text-primary-foreground">
                  Approve
                </span>
                <span className="rounded-lg border border-border px-4 py-[9px] font-sans text-[12.5px] font-medium leading-none text-foreground">
                  Deny
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={cn("flex flex-col gap-1.5", last ? "pb-0" : "pb-3.5")}>
          <Mono className="text-[9px] tracking-[0.1em] text-caption">
            {label}
          </Mono>
          <span className="font-sans text-[13.5px] font-normal leading-[1.35] text-foreground">
            {title}
          </span>
          <span className="font-mono text-[9.5px] tracking-[0.01em] text-caption">
            {meta}
          </span>
        </div>
      )}
    </div>
  );
}

export function WorkflowsSurface() {
  const runDetails: [string, string][] = [
    ["TRIGGER", "Manual · Olivia B."],
    ["SCOPE", "Commercial · 1 contract"],
    ["AUTONOMY", "Supervised"],
    ["STARTED", "Today · 09:58"],
    ["STEP", "2 of 3"],
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-sans text-[22px] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
            Review an inbound NDA
          </h1>
          <p className="max-w-[48ch] font-sans text-[13px] font-normal leading-[1.5] text-muted-foreground">
            A multi-step run that works on its own, and pauses for your call
            before anything leaves the building.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full border border-primary/[0.18] bg-primary/[0.08] px-[11px] py-1.5 font-mono text-[10px] font-medium tracking-[0.1em] text-primary">
          <span className="size-1.5 rounded-full bg-primary" /> PAUSED
        </span>
      </div>
      <div className="mt-0.5 grid grid-cols-[1.55fr_1fr] items-start gap-7">
        <div>
          <RunStep
            kind="done"
            label="STEP 1 · AGENT"
            title="Identify the contract type and review it against your playbook."
            meta="Done · reviewed against the Commercial playbook"
          />
          <RunStep
            kind="approval"
            label="PAUSED · FOR YOUR APPROVAL"
            title="Review the flagged terms and suggested redlines before the workflow continues."
            meta="Three terms are flagged for your attention. Approve to continue, or deny to stop here."
          />
          <RunStep
            kind="pending"
            label="STEP 3 · ACTION"
            title="Draft a cover email summarizing the requested changes."
            meta="Queued · waiting on approval"
            last
          />
        </div>
        <div className="rounded-xl border border-hairline bg-paper-2 px-[18px] py-4">
          <Mono className="text-[10px] tracking-[0.14em] text-caption">
            RUN DETAILS
          </Mono>
          <div className="mt-3.5 flex flex-col gap-[13px]">
            {runDetails.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1">
                <Mono className="text-[9px] tracking-[0.1em] text-caption">
                  {k}
                </Mono>
                <span className="font-sans text-[13px] font-normal leading-[1.3] text-foreground">
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-hairline pt-[13px]">
            <span className="font-mono text-[9px] leading-[1.5] tracking-[0.01em] text-caption">
              Every write pauses for approval, in every autonomy mode.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 5 · ADMIN (mirrors the REAL admin page) ─────────────────────────── */
function AuditPeek() {
  const rows: { title: string; detail: string; when: string }[] = [
    {
      title: "Role changed",
      detail: "Olivia Bellini promoted to Admin",
      when: "2h ago",
    },
    {
      title: "Connection set read-only",
      detail: "OneDrive, org-wide",
      when: "Yesterday",
    },
    {
      title: "Member deactivated",
      detail: "Contractor offboarded, access revoked",
      when: "Jun 24",
    },
  ];
  return (
    <div className="rounded-[14px] border border-hairline bg-paper-2 p-[18px]">
      <Mono className="text-[10px] tracking-[0.14em] text-caption">
        AUDIT LOG
      </Mono>
      <div className="mt-3.5 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.title} className="flex items-start gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span className="font-sans text-[12.5px] font-medium leading-[1.3] text-foreground">
                  {r.title}
                </span>
                <span className="shrink-0 font-mono text-[9px] tracking-[0.04em] text-caption">
                  {r.when}
                </span>
              </div>
              <span className="font-sans text-[12px] font-normal leading-[1.4] text-muted-foreground">
                {r.detail}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminSurface() {
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-[22px] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
          Admin
        </h1>
        <p className="max-w-[60ch] font-sans text-[13px] font-normal leading-[1.5] text-muted-foreground">
          Govern how your organization uses legalOS, and measure the value it
          delivers.
        </p>
      </div>

      {/* the real GOVERN / MEASURE grouped rows, rendered with the shipping
          LandingRow and the shipped ADMIN_NAV_GROUPS copy */}
      <div className="flex flex-col gap-5">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.caption} className="flex flex-col gap-2">
            <Mono className="text-[10px] tracking-[0.14em] text-caption">
              {group.caption}
            </Mono>
            <div>
              {group.items.map((item) => (
                <LandingRow
                  key={item.href}
                  label={item.label}
                  description={item.description}
                  href={item.href}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <AuditPeek />
    </div>
  );
}
