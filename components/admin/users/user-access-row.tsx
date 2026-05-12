"use client";

import { Check, ChevronDownIcon, ChevronRightIcon, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  grantDepartmentAccessAction,
  revokeDepartmentAccessAction,
} from "@/lib/actions/admin-users";
import type { OrgUser } from "@/lib/auth/access";

/**
 * Slim department shape passed down from the admin page. The full
 * org department list is fetched once server-side and threaded through
 * every row; no per-row fetch.
 */
export interface AdminDepartment {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

const ROLE_LABEL: Record<OrgUser["role"], string> = {
  super_admin: "Super admin",
  org_admin: "Org admin",
  user: "User",
};

/**
 * Format a created_at ISO timestamp as `MAY 11, 2026` mono-uppercase
 * via Intl.DateTimeFormat. Matches the chat surface's date treatment.
 */
function formatJoined(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
      .format(d)
      .toUpperCase();
  } catch {
    return "—";
  }
}

/**
 * One user's row in the admin User access list (Session 29).
 *
 * Collapsed state — single button row showing name / email / role chip
 * / joined date plus a chevron. Clicking anywhere on the row toggles
 * expansion.
 *
 * Expanded state — inline panel with a row of toggleable department
 * chips. Granted departments render in the slate-blue (primary) chip
 * style matching the existing "Department Agent" / "Web search"
 * vocabulary; revoked departments render muted with a hairline border.
 * Click toggles via grantDepartmentAccessAction or
 * revokeDepartmentAccessAction. useTransition drives the optimistic
 * update; on failure the state reverts and a toast.error surfaces.
 *
 * Accessibility:
 *   - The header is a `<button aria-expanded>` so the disclosure
 *     pattern matches WCAG conventions.
 *   - Each chip is `<button aria-pressed>` so screen readers announce
 *     the toggle state.
 *   - The chip group has an aria-label tying it back to the user.
 */
export function UserAccessRow({
  user,
  allDepartments,
  initialAccessIds,
}: {
  user: OrgUser;
  allDepartments: AdminDepartment[];
  /**
   * Department ids this user currently has access to. Plain string[]
   * (not Set) so it serializes cleanly across the RSC boundary — the
   * row reconstitutes the Set client-side for fast lookup.
   */
  initialAccessIds: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [accessSet, setAccessSet] = useState<Set<string>>(
    () => new Set(initialAccessIds),
  );

  const displayName = user.full_name?.trim() || user.email;
  const showEmailLine = Boolean(user.full_name?.trim());

  function toggleDept(dept: AdminDepartment) {
    const previousHadAccess = accessSet.has(dept.id);
    const optimistic = new Set(accessSet);
    if (previousHadAccess) optimistic.delete(dept.id);
    else optimistic.add(dept.id);
    setAccessSet(optimistic);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("user_id", user.id);
      formData.set("department_id", dept.id);
      const result = previousHadAccess
        ? await revokeDepartmentAccessAction(formData)
        : await grantDepartmentAccessAction(formData);
      if (!result.ok) {
        // Revert to the pre-click state.
        const reverted = new Set(optimistic);
        if (previousHadAccess) reverted.add(dept.id);
        else reverted.delete(dept.id);
        setAccessSet(reverted);
        toast.error(result.error);
      }
    });
  }

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="grid w-full grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {expanded ? (
          <ChevronDownIcon
            aria-hidden
            className="size-4 text-muted-foreground"
          />
        ) : (
          <ChevronRightIcon
            aria-hidden
            className="size-4 text-muted-foreground"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          {showEmailLine ? (
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {ROLE_LABEL[user.role]}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-caption tabular-nums">
          {formatJoined(user.created_at)}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-border bg-background px-4 py-3">
          <p className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>Click a department to toggle access.</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-full bg-chat-cite-bg"
                aria-hidden
              />
              Granted
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-full border border-border bg-card"
                aria-hidden
              />
              Click to grant
            </span>
          </p>
          <div
            role="group"
            aria-label={`Department access for ${displayName}`}
            className="flex flex-wrap gap-2"
          >
            {allDepartments.map((d) => {
              const hasAccess = accessSet.has(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={hasAccess}
                  aria-label={
                    hasAccess
                      ? `Revoke ${d.name} access`
                      : `Grant ${d.name} access`
                  }
                  disabled={pending}
                  onClick={() => toggleDept(d)}
                  className={
                    hasAccess
                      ? "inline-flex items-center gap-1.5 rounded-full bg-chat-cite-bg px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-primary transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                      : "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:border-hairline-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                  }
                >
                  {hasAccess ? (
                    <Check aria-hidden className="size-3" strokeWidth={2.5} />
                  ) : (
                    <Plus aria-hidden className="size-3" strokeWidth={2} />
                  )}
                  {d.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </li>
  );
}
