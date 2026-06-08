#!/usr/bin/env tsx
/**
 * Mint a single-use demo access link (Demo access Step 2, Part A).
 *
 * Usage:
 *   npm run mint-demo-token
 *   npm run mint-demo-token -- --by=you@example.com   (optional provenance)
 *
 * Requirements:
 *   - Migration 0065_demo_invitations.sql applied.
 *   - A seeded Demo Org (Step 1): exactly one organization with is_demo = true.
 *   - SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 *     (loaded via dotenv). NEXT_PUBLIC_SITE_URL is used for the printed link.
 *
 * Behavior:
 *   - Resolves the Demo Org as the org WHERE is_demo = true. If zero or MORE
 *     THAN ONE is_demo org exists, ABORTS (a token must point at exactly one
 *     known demo sandbox). Refuses to mint against a non-demo org.
 *   - Generates 32 bytes of entropy, stores only its SHA-256 HASH in
 *     demo_invitations (status pending, default 30-day expiry), and prints the
 *     shareable URL once. The raw token is never stored or logged again.
 *
 * The link signs the recipient into the Demo Org as super_admin with no email.
 */

import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { generateDemoToken } from "@/lib/demo/token";
import { resolveSiteUrl } from "@/lib/url/site-url";

config({ path: resolve(process.cwd(), ".env.local") });

type ServiceClient = ReturnType<typeof createClient>;

function createServiceClient(): ServiceClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Error: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set in .env.local.",
    );
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseArgs(): { by: string | undefined } {
  let by: string | undefined;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--by=")) by = arg.slice("--by=".length);
  }
  return { by };
}

async function main(): Promise<void> {
  const { by } = parseArgs();
  const supabase = createServiceClient();

  // Resolve the Demo Org: exactly one is_demo = true org, or abort.
  const { data: demoOrgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id, slug, is_demo")
    .eq("is_demo", true);
  if (orgErr) {
    console.error("Error resolving the Demo Org:", orgErr.message);
    process.exit(1);
  }
  const orgs = (demoOrgs ?? []) as Array<{
    id: string;
    slug: string;
    is_demo: boolean;
  }>;
  if (orgs.length === 0) {
    console.error(
      "Refusing: no organization has is_demo = true. Run the Step-1 demo-org seed first.",
    );
    process.exit(1);
  }
  if (orgs.length > 1) {
    console.error(
      `Refusing: ${orgs.length} organizations have is_demo = true. Expected exactly one Demo Org; resolve the ambiguity before minting.`,
    );
    process.exit(1);
  }
  const demoOrg = orgs[0];
  // Belt and suspenders: the resolved org must genuinely be a demo org.
  if (demoOrg.is_demo !== true) {
    console.error("Refusing: resolved org is not a demo org.");
    process.exit(1);
  }

  // Optionally resolve who is minting (provenance only; null is fine).
  let createdBy: string | null = null;
  if (by) {
    const { data: actor } = await supabase
      .from("users")
      .select("id")
      .ilike("email", by.trim())
      .maybeSingle();
    createdBy = (actor as { id: string } | null)?.id ?? null;
    if (!createdBy) {
      console.error(
        `Warning: no user found for --by=${by}; recording the token with no creator.`,
      );
    }
  }

  const { token, tokenHash } = generateDemoToken();
  const { error: insertErr } = await supabase.from("demo_invitations").insert({
    token_hash: tokenHash,
    organization_id: demoOrg.id,
    status: "pending",
    created_by_user_id: createdBy,
  } as never);
  if (insertErr) {
    console.error("Error inserting the demo token:", insertErr.message);
    process.exit(1);
  }

  const url = `${resolveSiteUrl()}/demo/${token}`;
  console.log("");
  console.log("Demo access link minted (single use, ~30-day expiry).");
  console.log(`Demo Org: ${demoOrg.slug} (${demoOrg.id})`);
  console.log("");
  console.log("Share this link over a trusted channel — it is shown ONCE:");
  console.log("");
  console.log(`  ${url}`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
