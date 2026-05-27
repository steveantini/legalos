"use client";

import { LockIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { DepartmentWithAccess } from "@/lib/auth/access";

import { DepartmentDescriptionEditor } from "./department-description-editor";
import { LockedDepartmentDialog } from "./locked-department-dialog";

/**
 * Card chrome classes split into base + hover so the hover treatment
 * (lift, slate-blue border, shadow grow per Session 17a) can be dropped
 * while the editor is in edit mode. Mid-edit the card is functionally
 * locked to its current state — a hover lift would falsely advertise
 * "this is clickable" when navigation is disabled.
 */
const CARD_BASE_CLASS =
  "group relative flex min-h-[192px] flex-col gap-4 rounded-[14px] border border-border bg-card p-[22px] shadow-[0_1px_0_rgba(26,24,22,0.02),0_1px_3px_rgba(26,24,22,0.04),0_8px_24px_-8px_rgba(26,24,22,0.06)] transition-[transform,box-shadow,border-color] duration-release ease-release motion-reduce:transition-none hover:duration-hover hover:ease-soft active:duration-press active:ease-spring active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
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
 * Locked variant — rendered when the user has no `user_department_roles`
 * row for the department (Session 29 — `hasAccess === false` from
 * `getAllDepartmentsWithAccess`). The card sits in the grid for visual
 * completeness; clicking it opens an in-product information dialog
 * (`LockedDepartmentDialog`) explaining the restriction. The bg
 * recedes to the page background, the heading + description tone down
 * to muted, the agent count is hidden, and a Lock icon appears
 * upper-right. The whole card is the click target — no separate
 * "Request access" footer (the prior mailto pattern leaked the
 * operator's email and caused an app switch on macOS).
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
  canEdit = false,
}: {
  department: DepartmentWithAccess;
  agentCount: number;
  canEdit?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!department.hasAccess) {
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
 * Locked variant. The whole card is a button that opens a centered
 * `LockedDepartmentDialog` explaining the restriction. No mailto, no
 * app switch, no "Request access" footer. The Lock icon in the upper
 * right is the only visual cue that this surface differs from the
 * active variant; on hover the card subtly lifts and the border darkens
 * to signal interactivity, but the lift is shallower than the active
 * card so the affordance reads as "informational" rather than
 * "navigate in".
 */
function LockedDepartmentCard({
  department,
}: {
  department: DepartmentWithAccess;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${department.name} (locked — open access information)`}
        className="group relative flex min-h-[192px] cursor-pointer flex-col gap-4 rounded-[14px] border border-border bg-background p-[22px] text-left transition-[transform,box-shadow,border-color] duration-release ease-release motion-reduce:transition-none hover:duration-hover hover:ease-soft active:duration-press active:ease-spring active:translate-y-0 active:scale-[0.99] hover:-translate-y-[1px] hover:border-hairline-strong hover:shadow-[0_1px_0_rgba(26,24,22,0.02),0_8px_18px_-10px_rgba(26,24,22,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
      </button>

      <LockedDepartmentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        departmentName={department.name}
      />
    </>
  );
}
