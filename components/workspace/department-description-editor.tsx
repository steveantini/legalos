"use client";

import { PencilIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateDepartmentDescriptionAction } from "@/lib/actions/departments";

interface DepartmentDescriptionEditorProps {
  departmentId: string;
  initialDescription: string | null;
  /**
   * Notifies the parent when the editor enters or exits edit mode. The
   * parent (DepartmentCard) uses this to swap its wrapper element from
   * `<Link>` to `<div>` mid-edit so accidental clicks on card chrome
   * outside the editor's flex slot don't trigger navigation.
   */
  onEditingChange?: (isEditing: boolean) => void;
}

const MAX_DESCRIPTION_LENGTH = 280;

/**
 * Inline-edit affordance on a department card's description (Session 26).
 *
 * Rendered by `DepartmentCard` only when the current user is an
 * org-level admin and the card is not in its locked variant. Component
 * owns:
 *
 *   - Optimistic local description state, seeded from initialDescription.
 *     On a successful save the local state is the new truth; on failure
 *     it reverts and a `toast.error` surfaces. Pattern mirrors
 *     `components/chat/model-picker.tsx` (Session 17a).
 *   - Edit-mode toggle (read-only view vs textarea + save/cancel).
 *   - Keyboard contract matching Session 17b's composer — ⌘/Ctrl+Return
 *     saves, plain Enter is newline, Esc cancels.
 *
 * Visual integration with the card:
 *
 *   - Pencil button is absolutely positioned with `absolute right-3
 *     top-3`. The editor's wrapper has no positioning context, so the
 *     pencil's `absolute` resolves to the card's Link wrapper (which
 *     carries `relative` — see `department-card.tsx`).
 *   - Pencil `onClick` calls `preventDefault` + `stopPropagation` so the
 *     click does not trigger the Link's navigation. Save/Cancel buttons
 *     do the same.
 *   - Visible-but-quiet at rest via `opacity-40 transition-opacity
 *     group-hover:opacity-100 focus-within:opacity-100
 *     motion-reduce:opacity-100` — matches the agent-card kebab + info-
 *     icon visibility model so both card types' admin affordances share
 *     one vocabulary. The previous `opacity-0` invisible-until-hover
 *     model failed on touch (no hover) and on first-encounter
 *     discovery; the 40%-at-rest pattern works on every input modality.
 *
 * Known limitation: while in edit mode, clicks on the card's heading
 * or foot (outside the editor's flex slot) still trigger Link
 * navigation. The wrapper stops propagation for clicks inside its own
 * bounds, which catches most accidental clicks. The user can always
 * Cancel to recover; the original description is preserved server-side.
 */
export function DepartmentDescriptionEditor({
  departmentId,
  initialDescription,
  onEditingChange,
}: DepartmentDescriptionEditorProps) {
  const [description, setDescription] = useState<string | null>(
    initialDescription,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const pencilButtonRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreFocusOnExit = useRef(false);

  // Return focus to the pencil button after exiting edit mode. Effect
  // (not inline call) so the pencil button is mounted in the DOM by
  // the time we focus it.
  useEffect(() => {
    if (!isEditing && restoreFocusOnExit.current) {
      restoreFocusOnExit.current = false;
      pencilButtonRef.current?.focus();
    }
  }, [isEditing]);

  function enterEdit(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(true);
    onEditingChange?.(true);
  }

  function exitEdit() {
    restoreFocusOnExit.current = true;
    setIsEditing(false);
    onEditingChange?.(false);
  }

  function handleCancel(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    exitEdit();
  }

  function handleSave(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (!textareaRef.current || pending) return;

    const raw = textareaRef.current.value.trim();
    const previous = description;
    const optimistic = raw === "" ? null : raw;

    setDescription(optimistic);
    exitEdit();

    startTransition(async () => {
      const formData = new FormData();
      formData.set("department_id", departmentId);
      formData.set("description", raw);

      const result = await updateDepartmentDescriptionAction(formData);
      if (!result.ok) {
        setDescription(previous);
        toast.error(result.error);
      }
    });
  }

  function handleTextareaKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
    }
  }

  // Belt-and-suspenders: while editing, stop any click bubbling up to
  // the Link wrapper. Individual interactive elements already do their
  // own stopPropagation; this catches clicks on non-interactive
  // children (e.g., the textarea's padding).
  function handleWrapperClick(e: React.MouseEvent) {
    if (isEditing) e.stopPropagation();
  }

  if (isEditing) {
    return (
      <div
        className="flex flex-1 flex-col gap-2"
        onClick={handleWrapperClick}
      >
        <textarea
          ref={textareaRef}
          autoFocus
          defaultValue={description ?? ""}
          maxLength={MAX_DESCRIPTION_LENGTH}
          onKeyDown={handleTextareaKeyDown}
          aria-label="Department description"
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] leading-[1.45] text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="rounded-md bg-foreground px-2.5 py-1 text-background transition-colors duration-[180ms] hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="rounded-md border border-border px-2.5 py-1 text-muted-foreground transition-colors duration-[180ms] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col" onClick={handleWrapperClick}>
      <p className="text-[13px] leading-[1.45] text-muted-foreground">
        {description ?? ""}
      </p>
      <button
        ref={pencilButtonRef}
        type="button"
        onClick={enterEdit}
        aria-label="Edit description"
        className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-muted-foreground opacity-40 transition-opacity hover:bg-card hover:text-foreground group-hover:opacity-100 focus-within:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:opacity-100"
      >
        <PencilIcon strokeWidth={1.5} className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
