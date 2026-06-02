import "server-only";

import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import type { TokenBundle } from "@/lib/connections/providers/types";

/**
 * MCP OAuth 2.1 orchestration (flag 2b-ii-2) — the control-plane seam.
 *
 * The @modelcontextprotocol/sdk is used here as a PROTOCOL LIBRARY only: its
 * discrete step-functions (discovery, dynamic client registration, authorization,
 * exchange, refresh) each RETURN their secret to us, and legalOS stores every one
 * in our own encrypted connection_secrets, governed and refreshed through our own
 * path. The SDK never custodies a token. This is Option A from the 2b-ii
 * investigation, the differentiator a regulated legal buyer requires.
 *
 * Built correct-by-construction against the SDK's typed contract (live proof is
 * deferred until a real server exists). Each orchestration function RE-DISCOVERS
 * the authorization server from the stored MCP server URL, so endpoints are never
 * stale and nothing extra has to be persisted to refresh later.
 *
 * Server-only: handles tokens and client secrets; never reaches the client bundle.
 */

/** Identity legalOS registers/presents to an MCP authorization server. */
const CLIENT_NAME = "legalOS";

/** Why an MCP auth operation failed. Carries no token material. */
export type McpAuthErrorReason =
  | "discovery_failed"
  | "registration_failed"
  | "authorization_failed"
  | "exchange_failed"
  | "refresh_failed";

export class McpAuthError extends Error {
  constructor(readonly reason: McpAuthErrorReason) {
    super(`MCP auth error (${reason})`);
    this.name = "McpAuthError";
  }
}

/**
 * The MCP connection's stored secret: a TokenBundle (so the uniform decrypt in
 * tokens.ts works for MCP exactly as for OAuth) plus the sidecar refresh needs —
 * the registered-client info and the server URL for re-discovery. Stored encrypted
 * in a single connection_secrets row (no schema change; the row is generic text).
 * The client_secret inside `mcpClientInformation` is custody-sensitive and lives
 * ONLY here, encrypted, service-role-only — never plaintext, never the client.
 */
export type McpStoredSecret = TokenBundle & {
  mcpClientInformation: OAuthClientInformationFull;
  mcpServerUrl: string;
};

/**
 * The MCP flow's sealed-cookie payload (encrypted, httpOnly, short-lived): the
 * CSRF nonce, the PKCE verifier, and the registered-client info the callback
 * needs to complete the exchange (the client was freshly registered at initiate
 * and isn't yet in the DB). Sealed with sealSecretJson / opened with openSecretJson.
 */
export type McpCookiePayload = {
  nonce: string;
  verifier: string;
  clientInformation: OAuthClientInformationFull;
  /**
   * The customer server URL for a SELF-HOSTED connection (flag 2b-ii-3). Present
   * only for the self-hosted path, where the callback has no registry entry to
   * read the URL from; carried in the sealed (encrypted, tamper-proof) cookie and
   * cross-checked against the signed server id's origin. Absent for first-party,
   * which reads the URL from the registry.
   */
  serverUrl?: string;
};

/** Map the SDK's OAuthTokens to our TokenBundle, preserving the prior refresh token if the server omits one (as Drive does). */
function toTokenBundle(
  tokens: OAuthTokens,
  previousRefreshToken: string | null,
): TokenBundle {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previousRefreshToken,
    expiresAt:
      typeof tokens.expires_in === "number"
        ? Date.now() + tokens.expires_in * 1000
        : null,
    scope: tokens.scope ?? null,
    tokenType: tokens.token_type ?? null,
  };
}

/**
 * Discover the authorization server for an MCP server URL. Resolves the auth
 * server from the protected-resource metadata (RFC 9728) when present, falling
 * back to the server's own origin as issuer, then fetches the authorization-server
 * metadata (endpoints). `resource` is the RFC 8707 audience identifier passed
 * through to the token requests (the seam for audience-bound / customer-IdP).
 */
async function discover(serverUrl: string) {
  const url = new URL(serverUrl);
  let authServerUrl: URL;
  let resource: URL | undefined;

  try {
    const protectedResource = await discoverOAuthProtectedResourceMetadata(url);
    resource = protectedResource.resource
      ? new URL(protectedResource.resource)
      : undefined;
    const first = protectedResource.authorization_servers?.[0];
    authServerUrl = first ? new URL(first) : new URL(url.origin);
  } catch {
    // No protected-resource metadata: the server's own origin is the issuer.
    authServerUrl = new URL(url.origin);
  }

  const metadata = await discoverAuthorizationServerMetadata(authServerUrl);
  if (!metadata) {
    throw new McpAuthError("discovery_failed");
  }
  return { authServerUrl, metadata, resource };
}

/**
 * Acquire the OAuth client to use with this authorization server. Performs RFC
 * 7591 dynamic client registration and RETURNS the client info to be stored in
 * our encrypted substrate (custody ours). A future static-pre-registered-client
 * path (e.g. a Google Cloud OAuth client) would slot in here.
 */
async function acquireClient(
  authServerUrl: URL,
  metadata: Awaited<ReturnType<typeof discoverAuthorizationServerMetadata>>,
  redirectUri: string,
  scope: string | undefined,
): Promise<OAuthClientInformationFull> {
  const clientMetadata: OAuthClientMetadata = {
    client_name: CLIENT_NAME,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
    ...(scope ? { scope } : {}),
  };
  try {
    return await registerClient(authServerUrl, {
      metadata: metadata ?? undefined,
      clientMetadata,
      scope,
    });
  } catch {
    throw new McpAuthError("registration_failed");
  }
}

/**
 * Begin the MCP authorization (connect initiate): discover, acquire the client,
 * and build the authorization URL + PKCE verifier. Returns everything the sealed
 * cookie must carry to complete the flow (the verifier and the client info), so
 * the callback can re-discover and exchange without anything pre-stored in the DB.
 */
export async function beginMcpAuthorization(params: {
  serverUrl: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): Promise<{
  authorizationUrl: URL;
  codeVerifier: string;
  clientInformation: OAuthClientInformationFull;
}> {
  const { serverUrl, redirectUri, state, scope } = params;
  const { authServerUrl, metadata, resource } = await discover(serverUrl);
  const clientInformation = await acquireClient(
    authServerUrl,
    metadata,
    redirectUri,
    scope,
  );

  try {
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      authServerUrl,
      {
        metadata,
        clientInformation,
        redirectUrl: redirectUri,
        state,
        ...(scope ? { scope } : {}),
        ...(resource ? { resource } : {}),
      },
    );
    return { authorizationUrl, codeVerifier, clientInformation };
  } catch {
    throw new McpAuthError("authorization_failed");
  }
}

/**
 * Complete the MCP authorization (connect callback): re-discover, then exchange
 * the authorization code for tokens, mapped to our TokenBundle. The client info
 * (from the sealed cookie) is the same one registered at initiate.
 */
export async function completeMcpAuthorization(params: {
  serverUrl: string;
  clientInformation: OAuthClientInformationFull;
  authorizationCode: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenBundle> {
  const { serverUrl, clientInformation, authorizationCode, codeVerifier, redirectUri } =
    params;
  const { authServerUrl, metadata, resource } = await discover(serverUrl);
  try {
    const tokens = await exchangeAuthorization(authServerUrl, {
      metadata,
      clientInformation,
      authorizationCode,
      codeVerifier,
      redirectUri,
      ...(resource ? { resource } : {}),
    });
    return toTokenBundle(tokens, null);
  } catch {
    throw new McpAuthError("exchange_failed");
  }
}

/**
 * Refresh an MCP access token (called from tokens.ts's MCP branch): re-discover,
 * then refresh through the SDK, mapped back to our TokenBundle and preserving the
 * prior refresh token if the server omits a new one. Refresh stays entirely in our
 * path; the SDK is only the protocol call, and the re-encrypted bundle lands back
 * in our store.
 */
export async function refreshMcpToken(params: {
  serverUrl: string;
  clientInformation: OAuthClientInformationFull;
  refreshToken: string;
}): Promise<TokenBundle> {
  const { serverUrl, clientInformation, refreshToken } = params;
  const { authServerUrl, metadata, resource } = await discover(serverUrl);
  try {
    const tokens = await refreshAuthorization(authServerUrl, {
      metadata,
      clientInformation,
      refreshToken,
      ...(resource ? { resource } : {}),
    });
    return toTokenBundle(tokens, refreshToken);
  } catch {
    throw new McpAuthError("refresh_failed");
  }
}
