"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformOwner } from "@/lib/auth/access";
import {
  computeDemoExpiry,
  normalizeDemoLabel,
  resolveDemoWindowDays,
  type MintDemoLinkResult,
  type RevokeDemoLinkResult,
} from "@/lib/demo/admin";
import { generateDemoToken } from "@/lib/demo/token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveSiteUrl } from "@/lib/url/site-url";

/**
 * Server actions for the platform demo-access surface (D-166). Both re-gate
 * with requirePlatformOwner() (never trust the page's gate) and use the
 * service-role client, because the platform owner is not a member of the demo
 * org — the cross-org operator pattern, mirroring the mint/reset scripts. All
 * writes are scoped to the resolved demo org id.
 */

const DEMO_ACCESS_PATH = "/workspace/platform/demo-access";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Resolve the single Demo Org (exactly one is_demo = true). Returns null on zero
 * or more than one, so callers fail safe rather than minting against the wrong
 * org — the same invariant the mint script enforces.
 */
async function resolveDemoOrgId(admin: AdminClient): Promise<string | null> {
  const { data } = await admin
    .from("organizations")
    .select("id, is_demo")
    .eq("is_demo", true);
  const orgs = (data ?? []) as Array<{ id: string; is_demo: boolean }>;
  if (orgs.length !== 1 || orgs[0].is_demo !== true) return null;
  return orgs[0].id;
}

/** Mint a labeled, time-window demo link. Returns the raw url ONCE. */
export async function mintDemoLinkAction(
  windowDaysInput: number,
  labelInput: string,
): Promise<MintDemoLinkResult> {
  await requirePlatformOwner();

  const admin = createSupabaseAdminClient();
  const demoOrgId = await resolveDemoOrgId(admin);
  if (!demoOrgId) {
    return {
      ok: false,
      error:
        "Could not resolve a single Demo Org. Seed the Demo Org (or resolve duplicates) and try again.",
    };
  }

  const days = resolveDemoWindowDays(windowDaysInput);
  const label = normalizeDemoLabel(labelInput);
  const expiresAt = computeDemoExpiry(Date.now(), days);
  const { token, tokenHash } = generateDemoToken();

  const { error } = await admin.from("demo_invitations").insert({
    token_hash: tokenHash,
    organization_id: demoOrgId,
    status: "active",
    label,
    expires_at: expiresAt,
  } as never);
  if (error) {
    return { ok: false, error: "Could not mint the link. Please try again." };
  }

  revalidatePath(DEMO_ACCESS_PATH);
  return {
    ok: true,
    url: `${resolveSiteUrl()}/demo/${token}`,
    label,
    expiresAt,
  };
}

/** Revoke an active link immediately. Scoped to the demo org for safety. */
export async function revokeDemoLinkAction(
  invitationId: string,
): Promise<RevokeDemoLinkResult> {
  await requirePlatformOwner();

  if (!invitationId) return { ok: false, error: "Missing link id." };

  const admin = createSupabaseAdminClient();
  const demoOrgId = await resolveDemoOrgId(admin);
  if (!demoOrgId) {
    return { ok: false, error: "Could not resolve the Demo Org." };
  }

  const { error } = await admin
    .from("demo_invitations")
    .update({ status: "revoked" } as never)
    .eq("id", invitationId)
    .eq("organization_id", demoOrgId);
  if (error) {
    return { ok: false, error: "Could not revoke the link. Please try again." };
  }

  revalidatePath(DEMO_ACCESS_PATH);
  return { ok: true };
}
