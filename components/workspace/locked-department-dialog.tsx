"use client";

import { LockIcon } from "lucide-react";
import { useEffect, useRef } from "react";

interface LockedDepartmentDialogProps {
  /**
   * Whether the dialog is currently open. The parent component owns
   * this state; the dialog reports dismissal via `onClose`.
   */
  open: boolean;
  /**
   * Called when the user dismisses the dialog (Escape key, backdrop
   * click, or the "Got it" button). Parent sets `open` to false in
   * response.
   */
  onClose: () => void;
  /**
   * The name of the locked department, displayed in the dialog copy.
   * E.g., "Privacy", "Product", "Compliance".
   */
  departmentName: string;
}

/**
 * Locked-department information dialog.
 *
 * Renders when the user clicks a department they don't have access to —
 * from either the workspace landing's `LockedDepartmentCard` or the
 * rail's locked-row branch. Replaces the prior mailto-based "Request
 * access" link, which opened the system mail client and leaked the
 * operator's email address into the DOM.
 *
 * Built on the native `<dialog>` element so escape-key dismissal, focus
 * trap, and screen-reader semantics work without extra code. Backdrop
 * click is handled in `onClick` by checking `event.target` against the
 * dialog element itself (clicks on the inner content bubble up with a
 * different target). Entrance is a brief fade plus minimal scale-up.
 *
 * Three visual elements only: a Lock icon (slate-blue, ~24px), one
 * sentence of explanatory copy, and a "Got it" dismissal button. No
 * separate heading — the sentence carries both the "what happened" and
 * "what's next" jobs.
 *
 * When an in-product access-request feature lands, this dialog will
 * gain a "Request access" button next to "Got it" that creates a real
 * notification rather than firing a mailto. Until then, the dialog is
 * informational.
 */
export function LockedDepartmentDialog({
  open,
  onClose,
  departmentName,
}: LockedDepartmentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync the `open` prop with the dialog's imperative open/close API.
  // `showModal()` opens with backdrop + focus trap; `close()` fires the
  // native `close` event, which we re-emit as `onClose`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        // Native <dialog>: clicks on the backdrop arrive with the
        // dialog element itself as the target; clicks on the inner
        // content bubble up with a descendant as the target. Compare
        // identity to distinguish.
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-background p-0 shadow-2xl backdrop:bg-foreground/20 backdrop:backdrop-blur-[2px] open:animate-in open:fade-in-0 open:zoom-in-95 open:duration-150"
    >
      <div className="flex w-[min(400px,90vw)] flex-col items-center gap-5 px-8 py-9 text-center">
        <LockIcon
          className="size-6 text-primary"
          strokeWidth={1.5}
          aria-hidden="true"
        />

        <p className="text-[17px] leading-snug text-foreground">
          <span className="font-medium">{departmentName}</span> is restricted.
          Your org admin can grant you access in User Access.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 inline-flex items-center justify-center rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Got it
        </button>
      </div>
    </dialog>
  );
}
