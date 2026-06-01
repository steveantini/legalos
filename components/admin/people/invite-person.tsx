"use client";

import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInvitationAction } from "@/lib/actions/admin-invitations";

import type { RosterDepartment } from "./person-row";

type OrgRole = "user" | "org_admin" | "super_admin";

const ROLE_LABEL: Record<OrgRole, string> = {
  super_admin: "Super admin",
  org_admin: "Org admin",
  user: "User",
};

/**
 * "Invite person" button + dialog (A3c). Collects an email, a role (escalation-
 * gated: an org_admin is never offered super_admin), and department access, then
 * submits to `createInvitationAction`, which sends the invite through Supabase's
 * auth email. On success the dialog closes and the page refreshes so the new
 * pending invite appears. Optimistic-feel via useTransition + toast, matching the
 * rest of the People surface.
 */
export function InvitePerson({
  actorRole,
  allDepartments,
}: {
  actorRole: "super_admin" | "org_admin";
  allDepartments: RosterDepartment[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("user");
  const [deptIds, setDeptIds] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();

  const roleOptions: OrgRole[] =
    actorRole === "super_admin"
      ? ["user", "org_admin", "super_admin"]
      : ["user", "org_admin"];

  function reset() {
    setEmail("");
    setRole("user");
    setDeptIds(new Set());
  }

  function toggleDept(id: string) {
    const next = new Set(deptIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDeptIds(next);
  }

  function submit() {
    if (pending) return;
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      toast.error("Enter an email address.");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("email", trimmed);
      formData.set("role", role);
      for (const id of deptIds) formData.append("department_id", id);

      const result = await createInvitationAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Invitation sent.");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={2} />
        Invite person
      </Button>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a person</DialogTitle>
          <DialogDescription>
            They’ll get an email to sign in. When they do, they’re set up
            automatically with the role and departments you choose here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => v && setRole(v as OrgRole)}
              disabled={pending}
            >
              <SelectTrigger id="invite-role" className="w-full bg-paper-2">
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
          </div>

          <div className="space-y-1.5">
            <Label>Department access</Label>
            <div
              role="group"
              aria-label="Department access for the invitation"
              className="flex flex-wrap gap-2"
            >
              {allDepartments.map((d) => {
                const selected = deptIds.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={() => toggleDept(d.id)}
                    className={
                      selected
                        ? "inline-flex items-center gap-1.5 rounded-full bg-chat-cite-bg px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-primary transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                        : "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:border-hairline-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                    }
                  >
                    {selected ? (
                      <Check aria-hidden className="size-3" strokeWidth={2.5} />
                    ) : (
                      <Plus aria-hidden className="size-3" strokeWidth={2} />
                    )}
                    {d.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] leading-[1.5] text-caption">
              They can be granted more access later. Leave empty to start with no
              departments.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
