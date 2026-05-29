/**
 * Provider-adapter contract for the connection OAuth flow.
 *
 * Every connectable provider supplies one adapter implementing this interface.
 * The flow (initiate route, callback route) is entirely provider-agnostic: it
 * looks the adapter up in the registry by provider id (carried in the OAuth
 * state) and calls these methods. Adding Microsoft, Slack, Calendar, or Gmail
 * later is adding an adapter to the registry, with zero changes to the flow,
 * the callback path, token storage, or the UI wiring (D-065).
 *
 * Types only here, so this module is safe to import from anywhere; the adapters
 * themselves perform network calls and read env, and are server-only.
 */

/** The tokens obtained from a provider, the shape stored encrypted at rest. */
export type TokenBundle = {
  accessToken: string;
  /** Null when the provider returns no refresh token (e.g. consent re-grant skipped). */
  refreshToken: string | null;
  /** Unix milliseconds when the access token expires, or null if unknown. */
  expiresAt: number | null;
  /** The space-delimited scopes the provider actually granted, or null. */
  scope: string | null;
  /** The OAuth token type (typically "Bearer"), or null. */
  tokenType: string | null;
};

/** Inputs for building a provider's authorization-redirect URL. */
export type BuildAuthorizationUrlParams = {
  /** The exact redirect_uri registered with the provider for this environment. */
  redirectUri: string;
  /** The signed OAuth state parameter (CSRF + provider routing). */
  state: string;
  /** The PKCE S256 code challenge. */
  codeChallenge: string;
};

/** Inputs for exchanging an authorization code for tokens. */
export type ExchangeCodeParams = {
  code: string;
  /** Must match the redirect_uri sent at authorization time exactly. */
  redirectUri: string;
  /** The PKCE code verifier whose challenge was sent at authorization time. */
  codeVerifier: string;
};

export type ProviderAdapter = {
  /** Stable provider id; matches connections-data.ts and connections.provider_id. */
  providerId: string;
  /** Capability category; matches connections-data.ts group ids and the policy. */
  capabilityCategory: string;
  /** The OAuth scopes requested at authorization time. */
  scopes: string[];
  /** OAuth 2.0 authorization endpoint. */
  authorizationEndpoint: string;
  /** OAuth 2.0 token endpoint. */
  tokenEndpoint: string;
  /** Name of the env var holding this provider's OAuth client id (server-only). */
  clientIdEnvVar: string;
  /** Name of the env var holding this provider's OAuth client secret (server-only). */
  clientSecretEnvVar: string;

  /** Build the authorization-redirect URL the user is sent to for consent. */
  buildAuthorizationUrl(params: BuildAuthorizationUrlParams): string;
  /** Exchange an authorization code for an access + refresh token bundle. */
  exchangeCode(params: ExchangeCodeParams): Promise<TokenBundle>;
  /** Mint a fresh access token from a refresh token (used by a later milestone). */
  refreshAccessToken(refreshToken: string): Promise<TokenBundle>;
  /** Fetch the connected account's display label (e.g. email), or null. */
  fetchAccountLabel(accessToken: string): Promise<string | null>;
};
