import "server-only";

import { isCurrentUserPlatformOwner } from "@/lib/auth/access";
import type { FeedbackKind, FeedbackStatus, FeedbackView } from "@/lib/feedback/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUndefinedTableError } from "@/lib/supabase/errors";

/**
 * Platform-owner reads for the feedback review surface (Step One). Feedback is
 * reviewed CROSS-ORG, so these read via the SERVICE-ROLE admin client behind a
 * platform-owner gate, exactly like the operator_* analytics views, NOT via a
 * user RLS SELECT policy. Every function re-checks isCurrentUserPlatformOwner()
 * defensively (the platform layout already 404s non-owners, but the data layer
 * never trusts the caller). Tolerant of the pre-migration window: an absent
 * `feedback` table reads as empty / zero.
 */

const KINDS = new Set<string>(["bug", "idea", "confusion", "other"]);
const STATUSES = new Set<string>(["new", "seen", "in_progress", "resolved", "wont_fix"]);

function toKind(value: unknown): FeedbackKind {
  return typeof value === "string" && KINDS.has(value) ? (value as FeedbackKind) : "other";
}
function toStatus(value: unknown): FeedbackStatus {
  return typeof value === "string" && STATUSES.has(value)
    ? (value as FeedbackStatus)
    : "new";
}

/** The cross-org feedback queue, newest first. Empty for non-owners and when the
 * table is not yet applied. */
export async function listFeedback(limit = 200): Promise<FeedbackView[]> {
  if (!(await isCurrentUserPlatformOwner())) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .select(
      "id, message, kind, status, context, created_at, users!created_by_user_id(full_name, email), organizations(name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!isUndefinedTableError(error)) {
      console.error("feedback read failed", { code: error.code });
    }
    return [];
  }
  return (data ?? []).map((raw) => {
    const r = raw as unknown as {
      id: string;
      message: string;
      kind: string;
      status: string;
      context: Record<string, unknown> | null;
      created_at: string;
      users: { full_name: string | null; email: string | null } | null;
      organizations: { name: string | null } | null;
    };
    return {
      id: r.id,
      message: r.message,
      kind: toKind(r.kind),
      status: toStatus(r.status),
      context: r.context ?? {},
      submitterName: r.users?.full_name?.trim() || r.users?.email || "A user",
      submitterEmail: r.users?.email ?? "",
      organizationName: r.organizations?.name ?? "their organization",
      createdAt: r.created_at,
    };
  });
}

/**
 * The count of unseen ('new') feedback, for the calm landing indicator. Zero for
 * non-owners and when the table is not yet applied. A head count, no rows pulled.
 */
export async function countNewFeedback(): Promise<number> {
  if (!(await isCurrentUserPlatformOwner())) return 0;
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (error) {
    if (!isUndefinedTableError(error)) {
      console.error("feedback count failed", { code: error.code });
    }
    return 0;
  }
  return count ?? 0;
}
