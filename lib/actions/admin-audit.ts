"use server";

import { isCurrentUserOrgAdmin } from "@/lib/auth/access";
import {
  getAuditLogPage,
  type AuditPage,
} from "@/lib/workspace/admin/audit/audit-log";

/**
 * Load-more for the audit-log viewer (A6). Fetches the next page of the unified
 * People activity feed, older than `cursor`. Org-admin gated (mirror-RLS, like
 * the page); the underlying reads are RLS-scoped regardless. Read-only — there is
 * no audit-writing path here.
 *
 * The file exports only this async function (no type exports) per D-072; the
 * AuditPage type is imported (erased) and used only as the return annotation.
 */
export async function loadMoreAuditAction(cursor: string): Promise<AuditPage> {
  if (!(await isCurrentUserOrgAdmin())) {
    return { events: [], hasMore: false, nextCursor: null };
  }
  return getAuditLogPage(cursor);
}
