import "server-only";

import type {
  BuildAuthorizationUrlParams,
  ExchangeCodeParams,
  ProviderAdapter,
  TokenBundle,
} from "@/lib/connections/providers/types";

/**
 * Google Drive OAuth adapter (the first provider; Microsoft, Slack, Calendar,
 * Gmail reuse the same flow by adding sibling adapters — D-065).
 *
 * Scopes are read-first: `drive.readonly` matches the connection policy's
 * read-only capability ceiling (migration 0044). Write scope (`drive.file` or
 * `drive`) is added later when a write capability is granted; it is NOT
 * requested here. `openid email profile` are requested only to label which
 * account connected (`provider_account_label`).
 *
 * `access_type=offline` + `prompt=consent` are required for Google to return a
 * refresh token; without them only a short-lived access token comes back.
 */

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

const SCOPES = [
  "openid",
  "email",
  "profile",
  // Read-only Drive access. Write (drive.file / drive) is deferred to the
  // write-capability-grant feature and must not be requested for a read connection.
  "https://www.googleapis.com/auth/drive.readonly",
];

const CLIENT_ID_ENV_VAR = "GOOGLE_OAUTH_CLIENT_ID";
const CLIENT_SECRET_ENV_VAR = "GOOGLE_OAUTH_CLIENT_SECRET";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// Google's token endpoint returns expires_in (seconds). Stamp an absolute
// expiry against the caller's clock; null if the field is absent.
function toTokenBundle(json: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}): TokenBundle {
  if (!json.access_token) {
    throw new Error("token response missing access_token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt:
      typeof json.expires_in === "number"
        ? Date.now() + json.expires_in * 1000
        : null,
    scope: json.scope ?? null,
    tokenType: json.token_type ?? null,
  };
}

export const googleDriveAdapter: ProviderAdapter = {
  providerId: "google-drive",
  capabilityCategory: "file-storage",
  scopes: SCOPES,
  authorizationEndpoint: AUTHORIZATION_ENDPOINT,
  tokenEndpoint: TOKEN_ENDPOINT,
  clientIdEnvVar: CLIENT_ID_ENV_VAR,
  clientSecretEnvVar: CLIENT_SECRET_ENV_VAR,

  buildAuthorizationUrl({
    redirectUri,
    state,
    codeChallenge,
  }: BuildAuthorizationUrlParams): string {
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set("client_id", requireEnv(CLIENT_ID_ENV_VAR));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    // Offline + forced consent so Google returns a refresh token.
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    // PKCE (api-security.md: always, even for confidential clients).
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },

  async exchangeCode({
    code,
    redirectUri,
    codeVerifier,
  }: ExchangeCodeParams): Promise<TokenBundle> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: requireEnv(CLIENT_ID_ENV_VAR),
        client_secret: requireEnv(CLIENT_SECRET_ENV_VAR),
        code_verifier: codeVerifier,
      }),
    });
    if (!response.ok) {
      // Failure path only: on a non-2xx, Google's token endpoint returns ONLY
      // error metadata ({"error":"...","error_description":"..."}) — never a
      // token — so the body is safe to log for diagnosis. The redirect_uri is a
      // public URL and is logged so a mismatch is visible. We do NOT log the
      // client secret, the authorization code, or the code verifier, and the
      // success branch below never logs its body (which WOULD carry tokens).
      const errorBody = await response.text();
      console.error("google token exchange failed", {
        status: response.status,
        redirectUri,
        body: errorBody,
      });
      throw new Error(`token exchange failed: ${response.status}`);
    }
    return toTokenBundle(await response.json());
  },

  async refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: requireEnv(CLIENT_ID_ENV_VAR),
        client_secret: requireEnv(CLIENT_SECRET_ENV_VAR),
      }),
    });
    if (!response.ok) {
      throw new Error(`token refresh failed: ${response.status}`);
    }
    const bundle = toTokenBundle(await response.json());
    // A refresh response usually omits the refresh token; preserve the original.
    return { ...bundle, refreshToken: bundle.refreshToken ?? refreshToken };
  },

  async fetchAccountLabel(accessToken: string): Promise<string | null> {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { email?: string };
    return json.email ?? null;
  },
};
