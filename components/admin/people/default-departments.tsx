"use client";

import { Check, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addDefaultDepartmentAction,
  removeDefaultDepartmentAction,
} from "@/lib/actions/admin-users";

import type { RosterDepartment } from "./person-row";

/**
 * The org's "default departments for new people" editor, migrated into People
 * (A3a). Edits `organization_default_departments`, which `ensure_user_provisioned`
 * grants to a user at first sign-in (migration 0021). Changes apply to NEW people
 * only; existing people keep their current access, so the copy says so plainly.
 *
 * Stays org_admin-editable (an operational setting, not a super-admin governance
 * decision like the connection policy or default model). Same optimistic
 * useTransition + toast idiom as the rest of the admin surfaces, in the People /
 * Policy register (filled chips, calm copy). Reuses the existing add/remove
 * default-department server actions, which now revalidate the People route.
 */
export function PeopleDefaultDepartments({
  allDepartments,
  initialDefaultIds,
}: {
  allDepartments: RosterDepartment[];
  initialDefaultIds: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [defaultIds, setDefaultIds] = useState<Set<string>>(
    () => new Set(initialDefaultIds),
  );

  function toggle(dept: RosterDepartment) {
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
    <section aria-labelledby="people-defaults">
      <h2
        id="people-defaults"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        Default departments for new people
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        The departments a new person receives automatically at first sign-in.
        Changes here apply to new people only; they don’t change anyone’s current
        access.
      </p>

      <div
        role="group"
        aria-label="Default departments for new people"
        className="mt-4 flex flex-wrap gap-2"
      >
        {allDepartments.map((dept) => {
          const isDefault = defaultIds.has(dept.id);
          return (
            <button
              key={dept.id}
              type="button"
              aria-pressed={isDefault}
              aria-label={
                isDefault
                  ? `Remove ${dept.name} from defaults`
                  : `Add ${dept.name} to defaults`
              }
              disabled={pending}
              onClick={() => toggle(dept)}
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
              {dept.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
