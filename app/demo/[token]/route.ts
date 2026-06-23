import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  buildDemoUserRow,
  evaluateDemoSessionGuard,
  evaluateDemoToken,
  type DemoInvitationRow,
} from "@/lib/demo/access";
import { rateLimitDemoAccess } from "@/lib/demo/rate-limit";
import {
  buildSyntheticDemoEmail,
  hashDemoToken,
} from "@/lib/demo/token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Demo access link: /demo/<token>.
 *
 * Signs a prospect into the shared, isolated Demo Org as super_admin with NO
 * email sent — the D-049 trick: create a synthetic user on an unroutable
 * `.invalid` address, then consume a server-generated magic link server-side to
 * mint the session cookie. Mirrors /auth/callback's cookie handling (the SSR
 * client writes session cookies into the route-handler response).
 *
 * TIME-WINDOW MODEL (D-166): the link works REPEATEDLY while now < expires_at
 * and it is not revoked — it is NOT consumed on first click. A returning
 * visitor on the same token maps back to the SAME synthetic user (recorded in
 * consumed_by_user_id), so they return to their own session and conversations
 * rather than a fresh user each visit. The shorter default window, revoke, and
 * per-org scoping (D-136) offset the softer "leaked link is burned" property
 * that single-use gave.
 *
 * GET-with-side-effects is intentional and matches link-based auth callbacks
 * (the magic-link/OAuth callback is also a GET). Links are shared over trusted
 * channels (Signal, text, in person), not emailed, so the email-prefetch risk
 * that single-use email links carry does not apply here.
 *
 * Every failure (invalid / revoked / expired token, rate limit, any error)
 * redirects to the generic /demo/unavailable page — no detail is leaked about
 * why, and the raw token is never logged.
 *
 * SESSION GUARD (D-170): a demo sign-in replaces the one Supabase cookie a
 * browser holds, so opening a link while signed in would silently clobber that
 * session. Before establishing the demo session, an EXISTING real (non-demo)
 * session is routed to a consent interstitial (/demo/confirm) instead of being
 * overwritten. Anonymous prospects and an explicit "Continue" (?confirm=demo)
 * flow straight through, so the prospect path is unchanged.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const requestUrl = new URL(request.url);
  const { origin } = requestUrl;
  const unavailable = NextResponse.redirect(`${origin}/demo/unavailable`);

  try {
    const { token } = await context.params;
    if (!token) return unavailable;

    // Defense-in-depth rate limit (the 256-bit token is the primary guard).
    // Key on a HASH of the client ip — never store/log the raw ip.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    if (!rateLimitDemoAccess(createHash("sha256").update(ip).digest("hex"))) {
      return unavailable;
    }

    const admin = createSupabaseAdminClient();
    const tokenHash = hashDemoToken(token);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // Session guard (D-170): never silently replace an existing real session
    // with the demo user. The decision is pure (evaluateDemoSessionGuard); here
    // we only gather its inputs. An explicit "Continue to demo" trip carries
    // ?confirm=demo and skips the check (and the lookups) entirely.
    const confirmed = requestUrl.searchParams.get("confirm") === "demo";
    if (!confirmed) {
      const session = await createSupabaseServerClient();
      const {
        data: { user: existingUser },
      } = await session.auth.getUser();
      let existingOrgIsDemo: boolean | null = null;
      if (existingUser) {
        const { data: existingProfile } = await admin
          .from("users")
          .select("organization_id")
          .eq("id", existingUser.id)
          .maybeSingle();
        const existingOrgId = (
          existingProfile as { organization_id: string } | null
        )?.organization_id;
        if (existingOrgId) {
          const { data: existingOrg } = await admin
            .from("organizations")
            .select("is_demo")
            .eq("id", existingOrgId)
            .maybeSingle();
          existingOrgIsDemo =
            (existingOrg as { is_demo: boolean } | null)?.is_demo ?? null;
        }
      }
      const guard = evaluateDemoSessionGuard({
        hasExistingSession: Boolean(existingUser),
        existingOrgIsDemo,
        confirmed,
      });
      if (guard.action === "interstitial") {
        return NextResponse.redirect(
          `${origin}/demo/confirm?token=${encodeURIComponent(token)}`,
        );
      }
    }

    // Read the invitation (no flip): the time-window model validates on every
    // visit rather than consuming on the first.
    const { data: rows } = await admin
      .from("demo_invitations")
      .select("id, organization_id, status, expires_at, consumed_by_user_id")
      .eq("token_hash", tokenHash)
      .limit(1);
    const decision = evaluateDemoToken(
      ((rows?.[0] ?? null) as DemoInvitationRow | null),
      nowMs,
    );
    if (!decision.valid) return unavailable;

    // Defense in depth: the token's org MUST be a demo org. buildDemoUserRow
    // throws otherwise, so a synthetic user can never be made in the real org.
    const { data: org } = await admin
      .from("organizations")
      .select("id, is_demo")
      .eq("id", decision.organizationId)
      .maybeSingle();
    if (!org) return unavailable;
    const demoOrg = org as { id: string; is_demo: boolean };

    // Resolve which synthetic user this visit signs in as.
    let email = await resolveExistingDemoUserEmail(
      admin,
      decision.existingUserId,
      demoOrg.id,
    );

    if (!email) {
      // First visit (or the prior user was deleted by a hard reset): create the
      // synthetic, unroutable user and bind it to the invitation.
      email = await provisionDemoUser(admin, demoOrg, decision.invitationId, nowIso);
      if (!email) return unavailable;
    }

    // Record the access on every visit (best effort — never blocks sign-in).
    await admin
      .from("demo_invitations")
      .update({ last_accessed_at: nowIso })
      .eq("id", decision.invitationId);

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

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Resolve the email of the synthetic user a token already bound, so a returning
 * visitor signs back into the SAME session. Returns null when the token has no
 * bound user yet, or its user no longer exists (e.g. a hard reset removed it,
 * which also nulls consumed_by_user_id via the FK).
 */
async function resolveExistingDemoUserEmail(
  admin: AdminClient,
  existingUserId: string | null,
  demoOrgId: string,
): Promise<string | null> {
  if (!existingUserId) return null;
  const { data } = await admin
    .from("users")
    .select("email")
    .eq("id", existingUserId)
    .eq("organization_id", demoOrgId)
    .maybeSingle();
  return (data as { email: string } | null)?.email ?? null;
}

/**
 * Provision a fresh synthetic demo user and bind it to the invitation. The bind
 * is an atomic conditional update (consumed_by_user_id IS NULL): if a concurrent
 * first visit won the bind, this caller discards its just-created user and
 * returns the winner's email instead, so a token never maps to two users.
 * Returns the email to sign in as, or null on a hard failure.
 */
async function provisionDemoUser(
  admin: AdminClient,
  demoOrg: { id: string; is_demo: boolean },
  invitationId: string,
  nowIso: string,
): Promise<string | null> {
  const email = buildSyntheticDemoEmail(randomUUID());
  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createErr || !created.user) {
    console.error("demo access: createUser failed", { code: createErr?.code });
    return null;
  }
  const authUserId = created.user.id;

  // Provision as super_admin of the DEMO org (throws if org is not is_demo).
  const userRow = buildDemoUserRow(demoOrg, authUserId, email);
  const { error: userErr } = await admin.from("users").insert(userRow);
  if (userErr) {
    console.error("demo access: users insert failed", { code: userErr.code });
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return null;
  }

  // Grant access to every demo department so the demo user sees everything
  // (read access keys on user_department_roles even for super_admin).
  const { data: depts } = await admin
    .from("departments")
    .select("id")
    .eq("organization_id", demoOrg.id)
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

  // Atomically bind this user to the invitation IFF it has no user yet. A
  // concurrent first visit that already bound a user makes this return zero
  // rows; we then defer to the winner and discard our extra user.
  const { data: bound } = await admin
    .from("demo_invitations")
    .update({ consumed_by_user_id: authUserId, consumed_at: nowIso })
    .eq("id", invitationId)
    .is("consumed_by_user_id", null)
    .select("id");

  if (bound && bound.length > 0) return email;

  // Lost the race: use the winner's user; clean up the one we created.
  await admin.auth.admin.deleteUser(authUserId).catch(() => {});
  const { data: winner } = await admin
    .from("demo_invitations")
    .select("consumed_by_user_id")
    .eq("id", invitationId)
    .maybeSingle();
  const winnerId =
    (winner as { consumed_by_user_id: string | null } | null)?.consumed_by_user_id ??
    null;
  return resolveExistingDemoUserEmail(admin, winnerId, demoOrg.id);
}
