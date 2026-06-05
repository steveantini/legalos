"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getCurrentUserProfile,
  isCurrentUserSuperAdmin,
} from "@/lib/auth/access";
import { getVendorProvider } from "@/lib/content/vendor-registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server action for the admin Policy & access "Content" section (C4L/platform arc
 * Step 5): a super admin turns a vendor content provider ON or OFF for their org.
 * OFF hides that provider's curated agents org-wide (the launchpad gates on this).
 *
 * Authorization is super-admin only, gated FIRST with `isCurrentUserSuperAdmin()`
 * to mirror the write RLS (`content_provider_settings_super_admin_write`); RLS
 * re-enforces at the DB layer (defense-in-depth). The provider id is validated
 * against the registry so only real providers get a row. Default-permit means a
 * provider with no row is enabled; this writes an explicit row to persist a
 * choice (enabling re-permits via the row's `enabled = true`).
 *
 * Exports only this async function (no type exports) per D-072; the result type
 * flows to the caller via inference.
 */

const inputSchema = z.object({
  providerId: z.string().min(1),
  enabled: z.boolean(),
});

export async function setVendorContentEnabledAction(
  providerId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  const parsed = inputSchema.safeParse({ providerId, enabled });
  if (!parsed.success || !getVendorProvider(parsed.data.providerId)) {
    return { ok: false, error: "Invalid request." };
  }

  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, error: "Could not resolve your organization." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("content_provider_settings").upsert(
    {
      organization_id: profile.organization_id,
      provider_id: parsed.data.providerId,
      enabled: parsed.data.enabled,
    },
    { onConflict: "organization_id,provider_id" },
  );

  if (error) {
    console.error("setVendorContentEnabledAction failed", { code: error.code });
    return { ok: false, error: "Could not save the setting. Try again." };
  }

  // Re-read the policy page on its next render; department launchpads are dynamic
  // and re-read the enablement state on their next request.
  revalidatePath("/workspace/admin/policy");
  return { ok: true };
}
