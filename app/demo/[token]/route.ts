import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  buildDemoUserRow,
  interpretTokenClaim,
  type ClaimedTokenRow,
} from "@/lib/demo/access";
import { rateLimitDemoAccess } from "@/lib/demo/rate-limit";
import {
  buildSyntheticDemoEmail,
  hashDemoToken,
} from "@/lib/demo/token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Demo access link (Step 2, Part A): /demo/<token>.
 *
 * Signs a prospect into the shared, isolated Demo Org as super_admin with NO
 * email sent — the D-049 trick: create a synthetic user on an unroutable
 * `.invalid` address, then consume a server-generated magic link server-side to
 * mint the session cookie. Mirrors /auth/callback's cookie handling (the SSR
 * client writes session cookies into the route-handler response).
 *
 * GET-with-side-effects is intentional and matches link-based auth callbacks
 * (the magic-link/OAuth callback is also a GET). Links are shared over trusted
 * channels (Signal, text, in person), not emailed, so the email-prefetch risk
 * that single-use email links carry does not apply here.
 *
 * Every failure (invalid / consumed / expired token, rate limit, any error)
 * redirects to the generic /demo/unavailable page — no detail is leaked about
 * why, and the raw token is never logged.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { origin } = new URL(request.url);
  const unavailable = NextResponse.redirect(`${origin}/demo/unavailable`);

  try {
    const { token } = await context.params;
    if (!token) return unavailable;

    // Defense-in-depth rate limit (the 256-bit single-use token is the primary
    // guard). Key on a HASH of the client ip — never store/log the raw ip.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    if (!rateLimitDemoAccess(createHash("sha256").update(ip).digest("hex"))) {
      return unavailable;
    }

    const admin = createSupabaseAdminClient();
    const tokenHash = hashDemoToken(token);
    const nowIso = new Date().toISOString();

    // ATOMIC single-use claim: one UPDATE flips pending → consumed and returns
    // the row. A race or replay sees status already 'consumed' and gets zero
    // rows back, so at most one caller ever proceeds to create a user.
    const { data: claimedRows } = await admin
      .from("demo_invitations")
      .update({ status: "consumed", consumed_at: nowIso })
      .eq("token_hash", tokenHash)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .select("id, organization_id");

    const claim = interpretTokenClaim(
      (claimedRows ?? null) as ClaimedTokenRow[] | null,
    );
    if (!claim.claimed) return unavailable;

    // Defense in depth: the token's org MUST be a demo org. buildDemoUserRow
    // throws otherwise, so a synthetic user can never be made in the real org.
    const { data: org } = await admin
      .from("organizations")
      .select("id, is_demo")
      .eq("id", claim.organizationId)
      .maybeSingle();
    if (!org) return unavailable;

    // Create the synthetic, unroutable user (no email is ever sent).
    const email = buildSyntheticDemoEmail(randomUUID());
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({ email, email_confirm: true });
    if (createErr || !created.user) {
      console.error("demo access: createUser failed", { code: createErr?.code });
      return unavailable;
    }
    const authUserId = created.user.id;

    // Provision as super_admin of the DEMO org (throws if org is not is_demo).
    const userRow = buildDemoUserRow(
      org as { id: string; is_demo: boolean },
      authUserId,
      email,
    );
    const { error: userErr } = await admin.from("users").insert(userRow);
    if (userErr) {
      console.error("demo access: users insert failed", { code: userErr.code });
      return unavailable;
    }

    // Grant access to every demo department so the demo user sees everything
    // (read access keys on user_department_roles even for super_admin).
    const { data: depts } = await admin
      .from("departments")
      .select("id")
      .eq("organization_id", org.id)
      .is("deleted_at", null);
    if (depts && depts.length > 0) {
      await admin.from("user_department_roles").insert(
        (depts as { id: string }[]).map((d) => ({
          user_id: authUserId,
          department_id: d.id,
          role: "dept_admin",
        })),
      );
    }

    // Record which synthetic user this token created (best effort).
    await admin
      .from("demo_invitations")
      .update({ consumed_by_user_id: authUserId })
      .eq("id", claim.invitationId);

    // Mint the session WITHOUT email: generate a magic link, then verify its
    // token hash on the SSR server client, which writes the session cookies
    // into this route handler's response (same mechanism as /auth/callback).
    const { data: link, error: linkErr } =
      await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHashForOtp = link?.properties?.hashed_token;
    if (linkErr || !tokenHashForOtp) {
      console.error("demo access: generateLink failed", { code: linkErr?.code });
      return unavailable;
    }

    const supabase = await createSupabaseServerClient();
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHashForOtp,
    });
    if (verifyErr) {
      console.error("demo access: verifyOtp failed", { code: verifyErr.code });
      return unavailable;
    }

    return NextResponse.redirect(`${origin}/workspace`);
  } catch (err) {
    // Never leak the token or internals; log only a stable marker.
    console.error("demo access: unexpected failure", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return unavailable;
  }
}
