"use client";

import { Check, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addDefaultDepartmentAction,
  removeDefaultDepartmentAction,
} from "@/lib/actions/admin-users";

import type { AdminDepartment } from "./user-access-row";

/**
 * Top section of the admin User access page (Session 29) — the org's
 * "default access for new users" configuration.
 *
 * Renders every department in the org as a toggleable chip; chips for
 * departments currently in the defaults list use the slate-blue
 * (primary) treatment, the rest render muted with a hairline border.
 * Click toggles via addDefaultDepartmentAction / removeDefaultDepartmentAction.
 *
 * Optimistic update via useTransition. On failure the local state
 * reverts and a toast.error surfaces with the action's error message.
 *
 * Changes here apply only to NEW users at first provisioning per
 * migration 0021's extension to `ensure_user_provisioned`. Existing
 * users keep their current grants regardless of edits to this section —
 * the explanatory copy below the heading makes this explicit so an
 * admin doesn't expect "add default" to retroactively grant access.
 */
export function DefaultDepartmentsSection({
  allDepartments,
  initialDefaultIds,
}: {
  allDepartments: AdminDepartment[];
  initialDefaultIds: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [defaultIds, setDefaultIds] = useState<Set<string>>(
    () => new Set(initialDefaultIds),
  );

  function toggle(dept: AdminDepartment) {
    const previouslyDefault = defaultIds.has(dept.id);
    const optimistic = new Set(defaultIds);
    if (previouslyDefault) optimistic.delete(dept.id);
    else optimistic.add(dept.id);
    setDefaultIds(optimistic);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("department_id", dept.id);
      const result = previouslyDefault
        ? await removeDefaultDepartmentAction(formData)
        : await addDefaultDepartmentAction(formData);
      if (!result.ok) {
        const reverted = new Set(optimistic);
        if (previouslyDefault) reverted.add(dept.id);
        else reverted.delete(dept.id);
        setDefaultIds(reverted);
        toast.error(result.error);
      }
    });
  }

  return (
    <section>
      <header>
        <h2 className="text-base font-semibold">
          Default access for new users
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          New users are granted these departments automatically at first
          sign-in. Changes take effect for new sign-ups only — existing
          users keep their current access.
        </p>
      </header>
      <p className="mt-4 mb-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Click a department to toggle whether it&apos;s a default for new users.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2 rounded-full bg-chat-cite-bg"
            aria-hidden
          />
          Currently a default
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2 rounded-full border border-border bg-card"
            aria-hidden
          />
          Click to add as default
        </span>
      </p>
      <div
        role="group"
        aria-label="Default departments for new users"
        className="flex flex-wrap gap-2"
      >
        {allDepartments.map((d) => {
          const isDefault = defaultIds.has(d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={isDefault}
              aria-label={
                isDefault
                  ? `Remove ${d.name} from defaults`
                  : `Add ${d.name} as default`
              }
              disabled={pending}
              onClick={() => toggle(d)}
              className={
                isDefault
                  ? "inline-flex items-center gap-1.5 rounded-full bg-chat-cite-bg px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-primary transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                  : "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:border-hairline-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
              }
            >
              {isDefault ? (
                <Check aria-hidden className="size-3" strokeWidth={2.5} />
              ) : (
                <Plus aria-hidden className="size-3" strokeWidth={2} />
              )}
              {d.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
