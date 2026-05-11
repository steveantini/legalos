"use client";

import { LockIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { siteConfig } from "@/config/site";
import type { AccessibleDepartment } from "@/lib/auth/access";

import { DepartmentDescriptionEditor } from "./department-description-editor";

/**
 * Card chrome classes split into base + hover so the hover treatment
 * (lift, slate-blue border, shadow grow per Session 17a) can be dropped
 * while the editor is in edit mode. Mid-edit the card is functionally
 * locked to its current state — a hover lift would falsely advertise
 * "this is clickable" when navigation is disabled.
 */
const CARD_BASE_CLASS =
  "group relative flex min-h-[192px] flex-col gap-4 rounded-[14px] border border-card-border bg-card p-[22px] shadow-[0_1px_0_rgba(26,24,22,0.02),0_1px_3px_rgba(26,24,22,0.04),0_8px_24px_-8px_rgba(26,24,22,0.06)] transition-[transform,box-shadow,border-color] duration-[220ms] ease-[cubic-bezier(.2,.7,.2,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const CARD_HOVER_CLASS =
  "hover:-translate-y-[2px] hover:border-primary/35 hover:shadow-[0_1px_0_rgba(26,24,22,0.03),0_4px_8px_rgba(26,24,22,0.06),0_22px_38px_-12px_rgba(26,24,22,0.12),0_8px_24px_-8px_rgba(59,86,128,0.12)]";

/**
 * One department card in the Aperture Workspace grid.
 *
 * Active variant — the entire card is a Next `<Link>` — clicking
 * anywhere on the surface navigates to `/departments/<slug>`. Hover
 * lifts `-2px`, border darkens, shadow grows, arrow circle inverts
 * (paper bg → ink bg) per the spec's hover treatment. Foot shows
 * "{N} agents" + arrow.
 *
 * Locked variant — Phase 2 demo placeholder for future RBAC. The card
 * sits in the grid for visual completeness but is non-clickable: the
 * outer wrapper is a `<div>` (not `<Link>`), the bg recedes to the
 * page background, the heading + description tone down to muted, the
 * agent count is hidden, a Lock icon appears upper-right, and the
 * foot's arrow is replaced by a "Request access" mailto link to
 * `siteConfig.adminEmail` with a department-scoped subject + body.
 * Hover treatment is fully suppressed; only the mailto link is
 * interactive. Goes away when real per-user department-role gating
 * arrives via `user_department_roles` (D-035).
 *
 * Hover border `#d8d2c7` is between `--hairline` and `--hairline-strong`
 * — close enough to `--hairline-strong` (`#e3ddd1`) that we use that
 * token for the hover border rather than introducing a fourth stone
 * variant just for this case.
 *
 * Per the phantom-data scope rules (Session 9e), the foot's left text
 * is "{N} agent(s)" derived from real DB count, not the spec's
 * "{count} reviews · {savedH}h saved" placeholder. Locked cards omit
 * the count entirely — irrelevant when the user can't access.
 */
export function DepartmentCard({
  department,
  agentCount,
  isLocked = false,
  canEdit = false,
}: {
  department: AccessibleDepartment;
  agentCount: number;
  isLocked?: boolean;
  canEdit?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isLocked) {
    return <LockedDepartmentCard department={department} />;
  }

  const agentLabel = agentCount === 1 ? "1 agent" : `${agentCount} agents`;
  const showEditor = canEdit;

  const content = (
    <>
      <h3 className="text-[19px] font-medium leading-[1.15] tracking-[-0.018em] text-foreground">
        {department.name}
      </h3>
      {showEditor ? (
        <DepartmentDescriptionEditor
          departmentId={department.id}
          initialDescription={department.description}
          onEditingChange={setIsEditing}
        />
      ) : (
        <p className="flex-1 text-[13px] leading-[1.45] text-muted-foreground">
          {department.description ?? ""}
        </p>
      )}
      <div className="flex items-center justify-between border-t border-card-divider pt-3 font-mono text-[11px] tabular-nums text-caption">
        <span>{agentLabel}</span>
        <span
          aria-hidden
          className="grid h-[22px] w-[22px] place-items-center rounded-full bg-background text-foreground transition-[background,color,transform] duration-200 ease-out group-hover:translate-x-[2px] group-hover:bg-foreground group-hover:text-background"
        >
          →
        </span>
      </div>
    </>
  );

  if (isEditing) {
    return (
      <div className={`${CARD_BASE_CLASS} cursor-default`}>{content}</div>
    );
  }

  return (
    <Link
      href={`/workspace/departments/${department.slug}`}
      aria-label={`Open ${department.name} workspace`}
      className={`${CARD_BASE_CLASS} ${CARD_HOVER_CLASS}`}
    >
      {content}
    </Link>
  );
}

/**
 * Non-clickable locked variant. The whole card is a static `<div>`;
 * only the foot's "Request access" mailto is interactive. cursor:
 * not-allowed on the root broadcasts the locked state when the user
 * hovers the body; the `<a>` overrides to cursor: pointer over its
 * own bounds.
 */
function LockedDepartmentCard({
  department,
}: {
  department: AccessibleDepartment;
}) {
  const requestAccessHref =
    `mailto:${siteConfig.adminEmail}` +
    `?subject=${encodeURIComponent(`Request access to ${department.name} in legalOS`)}` +
    `&body=${encodeURIComponent(
      `Hi, I'd like to request access to the ${department.name} department in legalOS.`,
    )}`;

  return (
    <div
      aria-disabled="true"
      aria-label={`${department.name} (locked — request access from your admin)`}
      className="relative flex min-h-[192px] cursor-not-allowed flex-col gap-4 rounded-[14px] border border-card-border bg-background p-[22px]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[19px] font-normal leading-[1.15] tracking-[-0.018em] text-muted-foreground">
          {department.name}
        </h3>
        <LockIcon
          aria-label="Locked"
          strokeWidth={1.5}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </div>
      <p className="flex-1 text-[13px] leading-[1.45] text-muted-foreground/60">
        {department.description ?? ""}
      </p>
      <div className="flex items-center justify-end border-t border-card-divider pt-3 font-mono text-[11px] tabular-nums text-caption">
        <a
          href={requestAccessHref}
          className="cursor-pointer transition-colors duration-[180ms] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Request access
        </a>
      </div>
    </div>
  );
}
