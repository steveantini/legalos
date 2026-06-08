import { describe, expect, it } from "vitest";

import {
  buildSyntheticDemoEmail,
  generateDemoToken,
  hashDemoToken,
  SYNTHETIC_EMAIL_DOMAIN,
} from "./token";

describe("demo token generation + hashing", () => {
  it("generates a high-entropy base64url token and its sha256 hash", () => {
    const { token, tokenHash } = generateDemoToken();
    // 32 bytes base64url ≈ 43 chars, url-safe alphabet only.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(42);
    // sha256 hex is 64 chars.
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes deterministically so consume can match by hash, and never stores the raw token", () => {
    const { token, tokenHash } = generateDemoToken();
    expect(hashDemoToken(token)).toBe(tokenHash);
    // The hash is not the token (raw token is never persisted).
    expect(tokenHash).not.toBe(token);
  });

  it("produces distinct tokens across calls", () => {
    expect(generateDemoToken().token).not.toBe(generateDemoToken().token);
  });
});

describe("synthetic demo email", () => {
  it("uses the unroutable .invalid domain so no email is ever deliverable", () => {
    expect(SYNTHETIC_EMAIL_DOMAIN).toBe("legalos-internal.invalid");
    expect(buildSyntheticDemoEmail("abc-123")).toBe(
      "demo-abc-123@legalos-internal.invalid",
    );
  });
});
