/**
 * Provider-adapter contract for connections, organized as a discriminated union
 * by connection KIND (D-085, flag 1a).
 *
 * A connection adapter has a provider-agnostic base (providerId,
 * capabilityCategory) plus members specific to the mechanism it uses. The base
 * is shared by every kind; the kind-specific members live under a variant keyed
 * by a `kind` string-literal discriminant. OAuth data sources are the first and
 * (today) only kind, `kind: 'oauth'`. A future model-provider kind (flag 1b)
 * adds a `kind: 'model'` variant with its own fields and secret shape, joining
 * the union without disturbing the OAuth variant or any OAuth consumer. MCP and
 * other mechanisms add further variants later. One registry, one kind-aware
 * abstraction across every connection mechanism.
 *
 * Every connectable provider supplies one adapter. The OAuth flow (initiate
 * route, callback route) looks the adapter up in the registry by provider id
 * (carried in the OAuth state), narrows on `kind === 'oauth'`, and calls the
 * OAuth members. Adding Microsoft, Slack, Calendar, or Gmail is adding an
 * oauth-kind adapter to the registry, with zero changes to the flow, the
 * callback path, token storage, or the UI wiring (D-065).
 *
 * Types only here, so this module is safe to import from anywhere; the adapters
 * themselves perform network calls and read env, and are server-only.
 */

/**
 * The tokens obtained from an OAuth provider, the shape stored encrypted at
 * rest. This is the OAuth kind's secret shape; a future kind (e.g. a model
 * provider holding an API key) carries its own secret shape, not this one.
 */
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

/**
 * The provider-agnostic members shared by every connection kind. A provider id
 * and the capability category it belongs to are meaningful regardless of the
 * connection mechanism; everything else is kind-specific.
 */
export type ConnectionAdapterBase = {
  /** Stable provider id; matches connections-data.ts and connections.provider_id. */
  providerId: string;
  /** Capability category; matches connections-data.ts group ids and the policy. */
  capabilityCategory: string;
};

/**
 * The OAuth connection kind: data sources connected via OAuth 2.0 (Google Drive
 * today; Microsoft, Slack, Calendar, Gmail later). All OAuth-specific fields and
 * methods live here, behind `kind: 'oauth'`, so the OAuth flow narrows on the
 * discriminant before reaching them.
 */
export type OAuthProviderAdapter = ConnectionAdapterBase & {
  kind: "oauth";
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

/**
 * A credential resolved for an inference call: the API key and, for self-hosted
 * providers later, an optional base URL that overrides the provider's default
 * endpoint. This is the shape the chat route's credential resolver returns and
 * the inference-client constructor consumes. In managed mode (1b) `baseURL` is
 * left undefined (Anthropic uses the SDK default endpoint); bring-your-own-key
 * and self-hosted (1c) populate it.
 */
export type ModelCredential = {
  /** The provider API key used to authenticate inference calls. */
  apiKey: string;
  /** Override the provider's default API endpoint (self-hosted/BYO, 1c); unset in managed mode. */
  baseURL?: string;
};

/**
 * The result of validating a model credential against its provider (a cheap auth
 * check before a key is stored). On failure, `error` is a friendly, safe message
 * — it never carries the raw provider error or the key.
 */
export type CredentialValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * The model-provider connection kind: a provider whose models the product runs
 * for inference (Anthropic today; Google, OpenAI, self-hosted later). Unlike the
 * OAuth kind, a model provider authenticates by API key resolved PER ORG (a
 * managed platform key today, or bring-your-own next — 1c), not an OAuth flow,
 * so it is never connected through the OAuth connect/callback routes and lives
 * in its own registry keyed by vendor.
 *
 * For a model provider, `providerId` IS the vendor segment of a model id
 * (parseModelId, e.g. 'anthropic'); it keys both the chat-route dispatcher and
 * the credential resolver. `capabilityCategory` is a descriptive label here, NOT
 * yet a governed connection-policy category (that, with the schema and stored
 * connection rows, lands in 1c).
 *
 * The variant is forward-looking: `listModels` is where a later step sources the
 * available-models list from the provider rather than the static models.ts
 * array. It is OPTIONAL and unused in 1b — models still come from models.ts; the
 * Anthropic adapter does not implement it yet. Inference-client construction
 * stays in the provider's server-only module (lib/llm/anthropic for Anthropic),
 * driven by the resolved ModelCredential; a future refactor may fold it onto the
 * adapter once a second provider exists.
 */
export type ModelProviderAdapter = ConnectionAdapterBase & {
  kind: "model";
  /**
   * Validate a credential against the provider with a cheap auth check, before a
   * bring-your-own key is stored (1c). Returns a friendly result; never leaks the
   * raw provider error or the key.
   */
  validateCredential(
    credential: ModelCredential,
  ): Promise<CredentialValidationResult>;
  /** List the models this provider offers for a credential. Forward-looking; not called in 1b. */
  listModels?(credential: ModelCredential): Promise<string[]>;
};

/**
 * A connection adapter, discriminated by `kind`. The union holds two kinds: the
 * OAuth data-source kind (`kind: 'oauth'`) and the model-provider kind
 * (`kind: 'model'`, flag 1b); MCP and others follow. Consumers narrow on `kind`
 * to reach a variant's members — the OAuth routes reject any non-'oauth' kind
 * before touching OAuth members, and model providers are looked up in their own
 * vendor-keyed registry, never through the OAuth flow.
 */
export type ProviderAdapter = OAuthProviderAdapter | ModelProviderAdapter;
