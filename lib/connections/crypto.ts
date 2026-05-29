import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { TokenBundle } from "@/lib/connections/providers/types";

/**
 * Cryptographic primitives for the connection OAuth flow. Three concerns, one
 * symmetric secret (`CONNECTION_TOKEN_ENCRYPTION_KEY`, base64 of 32 random
 * bytes):
 *
 *   1. Token-bundle encryption (AES-256-GCM) — the raw access + refresh tokens
 *      are encrypted before they touch the database. The connections table
 *      holds only a reference (token_ref → connection_secrets.id); the
 *      ciphertext lives in connection_secrets, reachable only via the
 *      service-role client (RLS denies every other role). Tokens are never
 *      stored in the clear, never sent to the client, never logged.
 *
 *   2. OAuth state signing (HMAC-SHA256) — the `state` parameter carries the
 *      provider id, a nonce, and the initiating user id, signed so the callback
 *      can trust its contents weren't tampered with (CSRF + binding).
 *
 *   3. PKCE (S256) — even though this is a confidential client, PKCE is applied
 *      per api-security.md ("always use PKCE, even for confidential clients").
 *
 * Server-only: imports `node:crypto` and reads the encryption key, so it must
 * never be bundled for the client.
 */

const ALGORITHM = "aes-256-gcm";
// 12-byte IV is the GCM standard nonce length (NIST SP 800-38D). Stored
// alongside the auth tag and ciphertext as colon-separated hex.
const IV_BYTES = 12;

/** Name of the short-lived httpOnly cookie that carries the sealed flow state. */
export const OAUTH_STATE_COOKIE = "legalos_oauth_state";

/** The signed contents of the OAuth `state` query parameter. */
export type OAuthStatePayload = {
  /** providerId, e.g. "google-drive". */
  p: string;
  /** Random nonce, cross-checked against the sealed cookie (CSRF defense). */
  n: string;
  /** The initiating user's id; the callback rejects if the session differs. */
  u: string;
};

/** The encrypted contents of the OAuth state cookie. */
export type OAuthCookiePayload = {
  /** Same nonce as in the signed state; the two must match on return. */
  nonce: string;
  /** PKCE code_verifier, replayed at the token exchange. */
  verifier: string;
};

function masterKey(): Buffer {
  const raw = process.env.CONNECTION_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CONNECTION_TOKEN_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "CONNECTION_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (base64 of 32 random bytes)",
    );
  }
  return key;
}

// A distinct subkey for HMAC so the AES key and the MAC key are never the same
// bytes used for two purposes. Derived deterministically from the master.
function stateMacKey(): Buffer {
  return createHash("sha256")
    .update(masterKey())
    .update("legalos:connection-oauth-state")
    .digest();
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("malformed ciphertext");
  }
  const decipher = createDecipheriv(ALGORITHM, masterKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt a token bundle into the opaque string stored in connection_secrets. */
export function encryptTokenBundle(bundle: TokenBundle): string {
  return encrypt(JSON.stringify(bundle));
}

/** Decrypt a stored token bundle (used by token refresh, a later milestone). */
export function decryptTokenBundle(ciphertext: string): TokenBundle {
  return JSON.parse(decrypt(ciphertext)) as TokenBundle;
}

/** A URL-safe random token (base64url). Used for the state nonce and PKCE verifier. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE S256 code challenge for a given code verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Sign the OAuth state payload as `base64url(body).base64url(hmac)`. */
export function signState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateMacKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify and parse a signed state token, or null if tampered/malformed. */
export function verifyState(token: string): OAuthStatePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateMacKey())
    .update(body)
    .digest("base64url");
  if (!constantTimeEqual(sig, expected)) return null;
  try {
    return JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
  } catch {
    return null;
  }
}

/** Encrypt the OAuth cookie payload (nonce + PKCE verifier). */
export function sealOAuthCookie(payload: OAuthCookiePayload): string {
  return encrypt(JSON.stringify(payload));
}

/** Decrypt the OAuth cookie payload, or null if absent/tampered. */
export function openOAuthCookie(raw: string): OAuthCookiePayload | null {
  try {
    return JSON.parse(decrypt(raw)) as OAuthCookiePayload;
  } catch {
    return null;
  }
}

/** Length-safe constant-time string comparison (avoids timing leaks on the nonce). */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
