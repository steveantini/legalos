import "server-only";

/**
 * Base-URL and redirect-URI resolution for the connection OAuth flow.
 *
 * The redirect_uri sent to a provider must match the URI registered with that
 * provider EXACTLY (Google rejects any mismatch with redirect_uri_mismatch).
 * For Google Drive the single provider-agnostic callback is registered at:
 *   - https://legal-operating-system.vercel.app/api/connections/callback  (prod)
 *   - http://localhost:3000/api/connections/callback                       (local)
 *
 * Resolution deliberately uses NEXT_PUBLIC_SITE_URL (the canonical app URL,
 * already set in Vercel Production to https://legal-operating-system.vercel.app)
 * and falls back to http://localhost:3000 for local dev. It does NOT fall back
 * to VERCEL_URL the way the magic-link resolver does: VERCEL_URL is the unique
 * per-deploy hostname, which is NOT one of the registered redirect URIs, so
 * using it would break the flow. Preview deployments therefore cannot complete
 * a real OAuth round-trip unless their host is also registered — that is the
 * intended trade-off (one stable redirect URI per environment).
 */

/** The single provider-agnostic OAuth callback path. */
export const CONNECTIONS_CALLBACK_PATH = "/api/connections/callback";

/** Path prefix the OAuth state cookie is scoped to (covers connect + callback). */
export const CONNECTIONS_PATH_PREFIX = "/api/connections";

/** The Connections settings page the flow returns the user to. */
export const CONNECTIONS_PAGE_PATH = "/workspace/settings/connections";

/** Resolve the app's canonical base URL (no trailing slash). */
export function resolveAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  return "http://localhost:3000";
}

/** The exact callback URL registered with the OAuth provider for this environment. */
export function connectionsCallbackUrl(): string {
  return `${resolveAppBaseUrl()}${CONNECTIONS_CALLBACK_PATH}`;
}

/** Absolute URL of the Connections page, optionally with a status query param. */
export function connectionsPageUrl(
  query?: { error?: string; connected?: string },
): string {
  const base = `${resolveAppBaseUrl()}${CONNECTIONS_PAGE_PATH}`;
  if (query?.error) return `${base}?error=${encodeURIComponent(query.error)}`;
  if (query?.connected) {
    return `${base}?connected=${encodeURIComponent(query.connected)}`;
  }
  return base;
}
