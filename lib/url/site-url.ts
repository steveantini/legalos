/**
 * Resolve the app's canonical base URL for building absolute links that leave
 * the app and come back (magic-link callbacks, invite-acceptance redirects).
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL — set explicitly in Vercel Production for the
 *      canonical prod URL.
 *   2. VERCEL_URL — auto-injected on every Vercel runtime (Production + Preview),
 *      unique per deploy. Lets preview branches self-test email flows without
 *      hardcoding URLs.
 *   3. http://localhost:3000 — local dev fallback.
 *
 * Shared by the magic-link sign-in flow (app/(public)/login/actions.ts), the
 * invitation flow (lib/actions/admin-invitations.ts), and the demo-token mint
 * script (scripts/mint-demo-token.ts) so they all build absolute URLs the same
 * way. The single implementation everywhere (it previously had a divergent copy
 * in the mint script).
 *
 * Guarantees NO trailing slash, so callers can append "/auth/callback" (or
 * "/demo/<token>") without producing a doubled "//" if a configured
 * NEXT_PUBLIC_SITE_URL happens to include one. An empty or whitespace-only
 * NEXT_PUBLIC_SITE_URL is treated as unset (falls through to VERCEL_URL / local).
 */
export function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base =
    explicit && explicit.length > 0
      ? explicit
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";
  return base.replace(/\/+$/, "");
}
