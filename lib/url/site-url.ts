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
 * Shared by the magic-link sign-in flow (app/(public)/login/actions.ts) and the
 * invitation flow (lib/actions/admin-invitations.ts) so both build the
 * /auth/callback URL the same way. No trailing slash; callers append the path.
 */
export function resolveSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}
