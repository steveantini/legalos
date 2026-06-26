"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getCurrentUserProfile,
  isCurrentUserPlatformOwner,
  requireAuthUser,
} from "@/lib/auth/access";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_STATUSES,
} from "@/lib/feedback/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Feedback actions (Step One). `submitFeedback` is the SINGLE write path — the
 * client sends only its words (plus an optional light kind and the current
 * route); the server stamps the submitter, role, org, and context. This one
 * action is the clean seam where Step Two attaches `notifyNewFeedback(feedback)`
 * (fire-and-forget, never failing the insert); do not add alternate write paths.
 *
 * `setFeedbackStatus` is the platform-owner triage path: gated by
 * isCurrentUserPlatformOwner() and written via the service role (cross-org,
 * the operator pattern), since feedback has no user UPDATE policy.
 */

const PLATFORM_FEEDBACK_PATH = "/workspace/platform/feedback";
const GENERIC_ERROR = "Something went wrong. Please try again.";

// The client may send only these. Everything identifying is server-stamped.
const submitSchema = z.object({
  message: z.string().trim().min(FEEDBACK_MESSAGE_MIN, "Add a note first.").max(FEEDBACK_MESSAGE_MAX),
  kind: z.enum(FEEDBACK_KINDS).optional(),
  route: z.string().max(2000).optional(),
  userAgent: z.string().max(1000).optional(),
});

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(FEEDBACK_STATUSES),
});

export type SubmitFeedbackResult = { ok: true } | { ok: false; error: string };
export type FeedbackStatusResult = { ok: true } | { ok: false; error: string };

/** Any authenticated user submits a note from anywhere. The user types only the
 * message (and optionally picks a kind); identity and context are server-stamped
 * and unspoofable. */
export async function submitFeedback(input: {
  message: string;
  kind?: string;
  route?: string;
  userAgent?: string;
}): Promise<SubmitFeedbackResult> {
  const user = await requireAuthUser();
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Add a note first." };
  }
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) {
    // Feedback is org-stamped; a user with no org cannot be attributed.
    return { ok: false, error: GENERIC_ERROR };
  }

  // Server-stamped auto-context. The user typed none of this. Keep it to
  // non-secret signal that helps triage (where they were, who they are).
  const context: Record<string, unknown> = {
    route: parsed.data.route ?? null,
    role: profile.role,
    userAgent: parsed.data.userAgent ?? null,
    appCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("feedback").insert({
    created_by_user_id: user.id,
    organization_id: profile.organization_id,
    message: parsed.data.message,
    kind: parsed.data.kind ?? "other",
    context,
  });
  if (error) {
    console.error("feedback insert failed", { code: (error as { code?: string }).code });
    return { ok: false, error: GENERIC_ERROR };
  }

  // STEP-TWO SEAM: a successful insert is where notifyNewFeedback(feedback) will
  // be attached (fire-and-forget, never failing this insert). Nothing here yet.

  return { ok: true };
}

/** Platform-owner triage: move a note's status. Gated in code; written via the
 * service role (feedback has no user UPDATE policy). */
export async function setFeedbackStatus(input: {
  id: string;
  status: string;
}): Promise<FeedbackStatusResult> {
  await requireAuthUser();
  if (!(await isCurrentUserPlatformOwner())) {
    return { ok: false, error: "Only the platform owner can triage feedback." };
  }
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("feedback")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("feedback status update failed", { code: error.code });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(PLATFORM_FEEDBACK_PATH);
  return { ok: true };
}
