"use client";

import { Check, ChevronDownIcon, ChevronRightIcon, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setUserActiveAction } from "@/lib/actions/admin-deactivation";
import { updateUserRoleAction } from "@/lib/actions/admin-roles";
import {
  grantDepartmentAccessAction,
  revokeDepartmentAccessAction,
} from "@/lib/actions/admin-users";
import type { OrgUser } from "@/lib/auth/access";

/**
 * Slim department shape threaded down from the People page. The full org
 * department list is fetched once server-side and shared by every row.
 */
export interface RosterDepartment {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

type OrgRole = OrgUser["role"];

const ROLE_LABEL: Record<OrgRole, string> = {
  super_admin: "Super admin",
  org_admin: "Org admin",
  user: "User",
};

/** Format a created_at ISO timestamp as `MAY 11, 2026`, matching the roster. */
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
 * One person's row in the People roster (A3a + A3b). Disclosure pattern: the
 * collapsed header shows name / email / current role / joined date (plus an
 * "Inactive" marker for deactivated users); expanding reveals the org-role
 * editor, the department-access chips, and the account-status control.
 *
 * The role editor and the deactivate control both enforce the escalation rule
 * honestly in the UI (the server action and the database trigger are the real
 * guards):
 *   - A super_admin actor can set any role and deactivate/reactivate anyone.
 *   - An org_admin actor can set only user / org_admin and cannot edit OR change
 *     the status of a user who is currently super_admin (shown read-only with a
 *     quiet reason).
 *   - The org's last ACTIVE super_admin cannot be demoted or deactivated (shown
 *     read-only / disabled with a reason), for every actor.
 *   - A super_admin demoting OR deactivating THEMSELVES confirms first via a
 *     dialog.
 *
 * Department access still grants at role='user' (dept_admin assignment is out of
 * scope). Every control uses the optimistic useTransition + toast idiom,
 * reverting on server rejection.
 */
export function PersonRow({
  person,
  allDepartments,
  initialAccessIds,
  actorRole,
  actorUserId,
  isOnlyActiveSuperAdmin,
}: {
  person: OrgUser;
  allDepartments: RosterDepartment[];
  initialAccessIds: string[];
  /** The viewing admin's org role (the page is gated to org/super admins). */
  actorRole: "super_admin" | "org_admin";
  actorUserId: string;
  /**
   * True when THIS person is the org's only ACTIVE super_admin — the lockout
   * guard shared by the role editor (can't demote) and the status control
   * (can't deactivate). Active-aware so a deactivated super_admin never counts
   * as a protector (migration 0049 coupling fix).
   */
  isOnlyActiveSuperAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Role editor state.
  const [role, setRole] = useState<OrgRole>(person.role);
  const [rolePending, startRoleTransition] = useTransition();
  const [confirmRole, setConfirmRole] = useState<OrgRole | null>(null);

  // Account-status state.
  const [active, setActive] = useState<boolean>(person.is_active);
  const [statusPending, startStatusTransition] = useTransition();
  const [confirmSelfDeactivate, setConfirmSelfDeactivate] = useState(false);

  // Department-access state.
  const [accessPending, startAccessTransition] = useTransition();
  const [accessSet, setAccessSet] = useState<Set<string>>(
    () => new Set(initialAccessIds),
  );

  const displayName = person.full_name?.trim() || person.email;
  const showEmailLine = Boolean(person.full_name?.trim());

  // Editability of the role control, per the escalation rule.
  const lockedAsLastSuperAdmin = isOnlyActiveSuperAdmin && role === "super_admin";
  const orgAdminCannotEditSuper =
    actorRole === "org_admin" && role === "super_admin";
  const roleEditable = !lockedAsLastSuperAdmin && !orgAdminCannotEditSuper;
  const roleReadOnlyReason = lockedAsLastSuperAdmin
    ? "Your organization needs at least one active super admin, so this role can’t be changed."
    : orgAdminCannotEditSuper
      ? "Only a super admin can change a super admin’s role."
      : null;

  // An org_admin is never offered the super_admin option.
  const roleOptions: OrgRole[] =
    actorRole === "super_admin"
      ? ["user", "org_admin", "super_admin"]
      : ["user", "org_admin"];

  // Account-status control, governed by the same separation of duties: an
  // org_admin cannot change a super_admin's status; the last active super_admin
  // cannot be deactivated.
  const orgAdminCannotManageSuper =
    actorRole === "org_admin" && role === "super_admin";
  const statusManageable = !orgAdminCannotManageSuper;
  const deactivateLocked = isOnlyActiveSuperAdmin;
  const statusReadOnlyReason = orgAdminCannotManageSuper
    ? "Only a super admin can change a super admin’s status."
    : null;

  function applyStatusChange(nextActive: boolean) {
    const previousActive = active;
    setActive(nextActive);
    startStatusTransition(async () => {
      const formData = new FormData();
      formData.set("target_user_id", person.id);
      formData.set("active", nextActive ? "true" : "false");
      const result = await setUserActiveAction(formData);
      if (!result.ok) {
        setActive(previousActive);
        toast.error(result.error);
        return;
      }
      toast.success(nextActive ? "Account reactivated." : "Account deactivated.");
    });
  }

  function onDeactivateClick() {
    if (!statusManageable || statusPending || deactivateLocked) return;
    // Self-deactivation confirms first (the actor is signing themselves out).
    if (actorUserId === person.id) {
      setConfirmSelfDeactivate(true);
      return;
    }
    applyStatusChange(false);
  }

  function applyRoleChange(nextRole: OrgRole) {
    const previousRole = role;
    setRole(nextRole);
    startRoleTransition(async () => {
      const formData = new FormData();
      formData.set("target_user_id", person.id);
      formData.set("new_role", nextRole);
      const result = await updateUserRoleAction(formData);
      if (!result.ok) {
        setRole(previousRole);
        toast.error(result.error);
        return;
      }
      toast.success("Role updated.");
    });
  }

  function onRoleSelect(next: string | null) {
    if (!next || next === role || rolePending) return;
    const nextRole = next as OrgRole;
    // Self-demotion (a super admin removing their own super-admin access)
    // confirms first. The last-super-admin case is already read-only above,
    // so a confirm here can never be the lockout case.
    const isSelfDemotion =
      actorUserId === person.id &&
      role === "super_admin" &&
      nextRole !== "super_admin";
    if (isSelfDemotion) {
      setConfirmRole(nextRole);
      return;
    }
    applyRoleChange(nextRole);
  }

  function toggleDept(dept: RosterDepartment) {
    const previouslyHadAccess = accessSet.has(dept.id);
    const optimistic = new Set(accessSet);
    if (previouslyHadAccess) optimistic.delete(dept.id);
    else optimistic.add(dept.id);
    setAccessSet(optimistic);

    startAccessTransition(async () => {
      const formData = new FormData();
      formData.set("user_id", person.id);
      formData.set("department_id", dept.id);
      const result = previouslyHadAccess
        ? await revokeDepartmentAccessAction(formData)
        : await grantDepartmentAccessAction(formData);
      if (!result.ok) {
        const reverted = new Set(optimistic);
        if (previouslyHadAccess) reverted.add(dept.id);
        else reverted.delete(dept.id);
        setAccessSet(reverted);
        toast.error(result.error);
      }
    });
  }

  return (
    <li className="overflow-hidden rounded-lg bg-paper-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="grid w-full grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-4 text-left transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {expanded ? (
          <ChevronDownIcon aria-hidden className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p
            className={`truncate text-[15px] font-medium ${
              active ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {displayName}
          </p>
          {showEmailLine ? (
            <p className="truncate text-[12px] text-muted-foreground">
              {person.email}
            </p>
          ) : null}
        </div>
        <span className="flex items-center justify-end gap-2">
          {!active ? (
            <span className="rounded-full border border-hairline-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-caption">
              Inactive
            </span>
          ) : null}
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {ROLE_LABEL[role]}
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-caption tabular-nums">
          {formatJoined(person.created_at)}
        </span>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-6 border-t border-hairline bg-background px-5 py-4">
          {/* Role editor */}
          <div>
            <p className="text-[13px] font-medium text-foreground">
              Organization role
            </p>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground">
              What this person can do across the organization.
            </p>
            <div className="mt-3 max-w-[320px]">
              {roleEditable ? (
                <Select
                  value={role}
                  onValueChange={onRoleSelect}
                  disabled={rolePending}
                >
                  <SelectTrigger
                    className="w-full bg-paper-2"
                    aria-label={`Organization role for ${displayName}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {ROLE_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div>
                  <span className="inline-flex rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    {ROLE_LABEL[role]}
                  </span>
                  {roleReadOnlyReason ? (
                    <p className="mt-2 text-[12px] leading-[1.5] text-caption">
                      {roleReadOnlyReason}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Department access */}
          <div>
            <p className="text-[13px] font-medium text-foreground">
              Department access
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
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
              className="mt-3 flex flex-wrap gap-2"
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
                    disabled={accessPending}
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

          {/* Account status (deactivate / reactivate) */}
          <div>
            <p className="text-[13px] font-medium text-foreground">
              Account status
            </p>
            <p className="mt-0.5 max-w-[70ch] text-[12px] leading-[1.5] text-muted-foreground">
              {active
                ? "This person can sign in and use the workspace."
                : "This person is deactivated and can’t sign in. Their agents, connections, and history are kept and return when you reactivate them."}
            </p>
            <div className="mt-3">
              {statusManageable ? (
                active ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={statusPending || deactivateLocked}
                      onClick={onDeactivateClick}
                    >
                      Deactivate
                    </Button>
                    {deactivateLocked ? (
                      <p className="mt-2 text-[12px] leading-[1.5] text-caption">
                        Your organization needs at least one active super admin,
                        so this account can’t be deactivated.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={statusPending}
                    onClick={() => applyStatusChange(true)}
                  >
                    Reactivate
                  </Button>
                )
              ) : (
                <p className="text-[12px] leading-[1.5] text-caption">
                  {statusReadOnlyReason}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Self-demotion confirmation. Only opens for a super admin removing their
          own super-admin access; the last-super-admin case is read-only above. */}
      <Dialog
        open={confirmRole !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRole(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove your super admin access?</DialogTitle>
            <DialogDescription>
              You’re changing your own role to{" "}
              <strong>{confirmRole ? ROLE_LABEL[confirmRole] : ""}</strong>. You
              will lose super admin access, including the parts of the admin area
              reserved for super admins. Another super admin would need to restore
              it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmRole(null)}
              disabled={rolePending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmRole) {
                  const next = confirmRole;
                  setConfirmRole(null);
                  applyRoleChange(next);
                }
              }}
              disabled={rolePending}
            >
              Change my role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Self-deactivation confirmation. Only opens when the actor deactivates
          their own account; the last-active-super-admin case is disabled above. */}
      <Dialog
        open={confirmSelfDeactivate}
        onOpenChange={(open) => {
          if (!open) setConfirmSelfDeactivate(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate your own account?</DialogTitle>
            <DialogDescription>
              You’ll be signed out and lose access to the workspace immediately.
              Nothing is deleted, your agents, connections, and history are kept,
              and another admin can reactivate your account to restore access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmSelfDeactivate(false)}
              disabled={statusPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmSelfDeactivate(false);
                applyStatusChange(false);
              }}
              disabled={statusPending}
            >
              Deactivate my account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
