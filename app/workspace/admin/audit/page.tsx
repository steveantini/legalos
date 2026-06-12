import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuditLog } from "@/components/admin/audit/audit-log";
import { HelpLink } from "@/components/workspace/help-link";
import { isCurrentUserOrgAdmin, requireAuthUser } from "@/lib/auth/access";
import { getAuditLogPage } from "@/lib/workspace/admin/audit/audit-log";

export const metadata: Metadata = {
  title: "Audit log",
};

/**
 * Audit log (GOVERN, A6) — the read-only People activity feed. Surfaces the two
 * trigger-written audit tables (role_change_audit, user_status_audit) as one
 * chronological log: who changed whose role, and who deactivated or reactivated
 * whom. The capstone of the GOVERN side ("see what was done").
 *
 * Honest framing: this covers role and account-status changes only — the
 * governance events the People area records today. Other actions (Policy & access
 * edits, connection grant/revoke, invitation lifecycle, agent/department changes)
 * are not event-logged yet, so the subtitle scopes the log to people activity
 * rather than implying a complete audit.
 *
 * Gating: org-admin readable (matches both tables' `*_admin_read` RLS). The page
 * tightens to `isCurrentUserOrgAdmin()` at the top (mirror-RLS, like People and
 * Insights). The first page is fetched server-side (no client skeleton round-trip);
 * load-more appends older events via a server action. The admin layout owns the
 * 896px left-justified `<main>`.
 */
export default async function AdminAuditPage() {
  await requireAuthUser();
  if (!(await isCurrentUserOrgAdmin())) {
    notFound();
  }

  const initial = await getAuditLogPage();

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            Audit log
          </h1>
          <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            A record of people activity in your organization: who changed whose
            role, and who deactivated or reactivated an account. Read-only, newest
            first. Changes made directly in the database appear as system changes.
          </p>
        </div>
        <HelpLink topic="audit" className="mt-3" />
      </header>

      <AuditLog initial={initial} />
    </>
  );
}
