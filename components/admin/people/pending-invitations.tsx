"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  resendInvitationAction,
  revokeInvitationAction,
} from "@/lib/actions/admin-invitations";
import type { OrgInvitation } from "@/lib/auth/access";

const ROLE_LABEL: Record<OrgInvitation["role"], string> = {
  super_admin: "Super admin",
  org_admin: "Org admin",
  user: "User",
};

function formatSent(iso: string): string {
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
 * One pending-invitation row with resend / revoke. An org_admin cannot act on a
 * super_admin invitation (the buttons are replaced by a quiet reason); the
 * actions re-check, and the trigger backstops. Optimistic-feel via useTransition
 * + toast; on success the page refreshes so the list reflects the change.
 */
function PendingInviteRow({
  invite,
  actorRole,
  deptNameById,
}: {
  invite: OrgInvitation;
  actorRole: "super_admin" | "org_admin";
  deptNameById: Map<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canManage =
    actorRole === "super_admin" || invite.role !== "super_admin";
  const isExpired = invite.effective_status === "expired";

  const deptCount = invite.department_ids.length;
  const deptSummary =
    deptCount === 0
      ? "No departments"
      : deptCount <= 2
        ? invite.department_ids
            .map((id) => deptNameById.get(id) ?? "—")
            .join(", ")
        : `${deptCount} departments`;

  function run(
    action: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
  ) {
    if (pending) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("invitation_id", invite.id);
      const result = await action(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-4 rounded-lg bg-paper-2 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-foreground">
          {invite.email}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {ROLE_LABEL[invite.role]} · {deptSummary}
          {invite.invited_by_name ? ` · invited by ${invite.invited_by_name}` : ""}
        </p>
      </div>

      <span
        className={
          isExpired
            ? "shrink-0 rounded-full border border-hairline-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-caption"
            : "shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
        }
      >
        {isExpired ? "Expired" : "Pending"}
      </span>

      <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-caption tabular-nums sm:inline">
        {formatSent(invite.created_at)}
      </span>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(resendInvitationAction, "Invitation resent.")}
          >
            Resend
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(revokeInvitationAction, "Invitation revoked.")}
          >
            Revoke
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-[12px] leading-[1.5] text-caption">
          Super admin only
        </span>
      )}
    </li>
  );
}

/**
 * The pending-invitations section on the People page (A3c). Lists invites that
 * haven't been accepted yet (accepted invites appear in the roster). Calm empty
 * state when there are none.
 */
export function PendingInvitations({
  invitations,
  actorRole,
  allDepartments,
}: {
  invitations: OrgInvitation[];
  actorRole: "super_admin" | "org_admin";
  allDepartments: { id: string; name: string }[];
}) {
  const deptNameById = new Map(allDepartments.map((d) => [d.id, d.name]));

  return (
    <section aria-labelledby="people-invitations">
      <h2
        id="people-invitations"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        Pending invitations
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        People you’ve invited who haven’t signed in yet. Once they accept, they
        move into the roster above.
      </p>

      {invitations.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {invitations.map((invite) => (
            <PendingInviteRow
              key={invite.id}
              invite={invite}
              actorRole={actorRole}
              deptNameById={deptNameById}
            />
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-lg bg-paper-2 px-5 py-6 text-center text-[13px] text-muted-foreground">
          No pending invitations.
        </div>
      )}
    </section>
  );
}
