import type { Metadata } from "next";

import { DemoAccessManager } from "@/components/platform/demo-access-manager";
import { DemoHowItWorks } from "@/components/platform/demo-how-it-works";
import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import { requirePlatformOwner } from "@/lib/auth/access";
import {
  demoLinkDisplayStatus,
  type DemoInvitationView,
} from "@/lib/demo/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { captionLabel } from "@/lib/workspace/rail-styles";

export const metadata: Metadata = {
  title: "Demo access",
};

/**
 * Platform-owner Demo access page (D-166). Mint labeled, time-window demo
 * links, see who has access, and revoke. The platform layout gates with
 * requirePlatformOwner(); this page re-asserts it before reading cross-org demo
 * data with the service-role client (defense in depth, the operator_* pattern).
 */
export default async function PlatformDemoAccessPage() {
  await requirePlatformOwner();

  const admin = createSupabaseAdminClient();

  // Resolve the single Demo Org (exactly one is_demo = true).
  const { data: orgRows } = await admin
    .from("organizations")
    .select("id, is_demo")
    .eq("is_demo", true);
  const orgs = (orgRows ?? []) as Array<{ id: string; is_demo: boolean }>;
  const demoOrgId = orgs.length === 1 ? orgs[0].id : null;

  const invitations = demoOrgId
    ? await loadDemoInvitations(admin, demoOrgId)
    : [];

  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Demo access
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Mint a demo link for a prospect, label it so you remember who it is
          for, and revoke it when the evaluation is done. Links work for a set
          window, fourteen days by default, then expire on their own.
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-12">
        <DemoAccessManager
          demoOrgReady={demoOrgId !== null}
          invitations={invitations}
        />

        <section aria-labelledby="demo-how-heading">
          <h2 id="demo-how-heading" className={`${captionLabel} mb-3`}>
            Reference
          </h2>
          <CollapsibleSection
            title="How the demo works"
            description="What a prospect sees, what is empty by design, and how to refresh it."
            sectionKey="demo-how-it-works"
            defaultCollapsed={true}
          >
            <DemoHowItWorks />
          </CollapsibleSection>
        </section>
      </div>
    </>
  );
}

/** Load the demo org's invitations and derive each row's display status. A
 * plain async helper (not the component body) so the clock read stays out of
 * render. */
async function loadDemoInvitations(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  demoOrgId: string,
): Promise<DemoInvitationView[]> {
  const { data: rows } = await admin
    .from("demo_invitations")
    .select("id, label, status, created_at, expires_at, last_accessed_at")
    .eq("organization_id", demoOrgId)
    .order("created_at", { ascending: false });
  const nowMs = Date.now();
  return (
    (rows ?? []) as Array<{
      id: string;
      label: string | null;
      status: string;
      created_at: string;
      expires_at: string;
      last_accessed_at: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    label: r.label,
    displayStatus: demoLinkDisplayStatus(r, nowMs),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    lastAccessedAt: r.last_accessed_at,
  }));
}
