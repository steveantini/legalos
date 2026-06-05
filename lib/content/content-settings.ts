import "server-only";

import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Per-org vendor-content governance state (C4L/platform arc Step 5): whether each
 * content provider's curated agents are shown to the org, and when the provider
 * was last refreshed. Backed by `content_provider_settings` (migration 0059).
 *
 * DEFAULT-PERMIT: a provider with no row is ENABLED. So vendor content shows by
 * default and stays shown until a super admin explicitly disables a provider. The
 * reads are tolerant of the table being absent (pre-migration) — they resolve to
 * "all enabled", so the launchpad is unchanged until the migration lands.
 *
 * Server-only. Reads use the RLS-scoped per-request client (any org member may
 * read the enablement state). The last-refreshed write uses the service-role
 * client (the platform-owner refresh runs service-side).
 */

/** One provider's stored governance state. */
export type VendorContentSetting = {
  enabled: boolean;
  lastRefreshedAt: string | null;
};

/** A provider is enabled unless an explicit row says otherwise (default-permit). Pure. */
export function vendorContentEnabledFromSettings(
  settings: Record<string, VendorContentSetting>,
  providerId: string,
): boolean {
  return settings[providerId]?.enabled ?? true;
}

/**
 * The org's vendor-content settings, keyed by providerId. Absent providers carry
 * no entry (callers default them to enabled). `cache()`-wrapped so the launchpad
 * gate and the policy page share one read per request. Tolerant of the table not
 * existing yet (resolves to an empty map → all enabled).
 */
export const getVendorContentSettings = cache(
  async (): Promise<Record<string, VendorContentSetting>> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("content_provider_settings")
      .select("provider_id, enabled, last_refreshed_at");
    if (error || !data) return {};
    const out: Record<string, VendorContentSetting> = {};
    for (const row of data) {
      out[row.provider_id as string] = {
        enabled: (row.enabled as boolean | null) ?? true,
        lastRefreshedAt: (row.last_refreshed_at as string | null) ?? null,
      };
    }
    return out;
  },
);

/** Whether a vendor content provider is enabled for the org (default true). */
export async function isVendorContentEnabled(
  providerId: string,
): Promise<boolean> {
  return vendorContentEnabledFromSettings(
    await getVendorContentSettings(),
    providerId,
  );
}

/**
 * Record a successful platform-owner refresh of a provider (writes
 * last_refreshed_at). Service-role upsert — preserves `enabled` (sets it on
 * insert via the column default). Best-effort: a failure here must not fail the
 * refresh itself, so it logs and returns rather than throwing.
 */
export async function recordVendorContentRefreshed(
  organizationId: string,
  providerId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("content_provider_settings").upsert(
    {
      organization_id: organizationId,
      provider_id: providerId,
      last_refreshed_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider_id" },
  );
  if (error) {
    console.error("recordVendorContentRefreshed failed", { code: error.code });
  }
}
