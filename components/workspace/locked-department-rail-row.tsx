"use client";

import { LockIcon } from "lucide-react";
import { useState } from "react";

import { LockedDepartmentDialog } from "./locked-department-dialog";

interface LockedDepartmentRailRowProps {
  departmentName: string;
  className: string;
}

/**
 * Client wrapper for a locked department row in the workspace rail.
 *
 * Mirrors `LockedDepartmentCard`'s interaction model — clicking opens
 * the shared `<LockedDepartmentDialog>` rather than firing a mailto.
 * Extracted as its own client component so the parent `WorkspaceRail`
 * can stay server-rendered; only the locked-row leaves hydrate.
 *
 * Each instance owns its own dialog state. Multiple locked rows could
 * theoretically be in-flight simultaneously, but only one dialog can be
 * open at a time anyway (native `<dialog>` modal semantics).
 */
export function LockedDepartmentRailRow({
  departmentName,
  className,
}: LockedDepartmentRailRowProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${departmentName} (locked — open access information)`}
        className={className}
      >
        <span>{departmentName}</span>
        <LockIcon
          aria-hidden
          strokeWidth={1.5}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </button>

      <LockedDepartmentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        departmentName={departmentName}
      />
    </>
  );
}
