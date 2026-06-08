import { createHash, randomBytes } from "node:crypto";

/**
 * Demo access tokens (Step 2).
 *
 * A demo link is `/demo/<token>` where <token> is 32 bytes of cryptographic
 * entropy (base64url). We never store the raw token: only its SHA-256 hash
 * lives in `demo_invitations.token_hash`, so a database read can never
 * reconstruct a working link. At consume time the route hashes the incoming
 * token the same way and matches on the hash.
 *
 * Pure and dependency-free (node:crypto only) so the generation/hash logic is
 * unit-testable and shared verbatim between the mint script and the route.
 */

/** Reserved, unroutable TLD (RFC 2606) — guarantees no collision with, and no
 * email delivery to, any real address. Synthetic demo users live here. */
export const SYNTHETIC_EMAIL_DOMAIN = "legalos-internal.invalid";

/** Build the synthetic email for a demo user from a uuid. */
export function buildSyntheticDemoEmail(uuid: string): string {
  return `demo-${uuid}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/** SHA-256 hex of a raw token. The single source of truth for hashing, used by
 * both generation (to store) and consume (to look up). */
export function hashDemoToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Mint a fresh demo token: 32 bytes of entropy as a base64url string, plus its
 * hash for storage. The raw token is returned ONCE — the caller shows it and
 * discards it; only the hash is persisted. */
export function generateDemoToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashDemoToken(token) };
}
