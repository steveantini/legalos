import { describe, expect, it } from "vitest";

import {
  deriveMcpTrustTier,
  selfHostedServerId,
} from "@/lib/connections/providers/mcp-registry";

/**
 * The security-critical trust invariant (D-089): trust is DERIVED from the code
 * registry + the connect path, never stored. A first-party registry id wins
 * regardless of path; a self-hosted id via the self-hosted path is self_hosted;
 * anything else is untrusted. Crucially, a forged/unknown id can NEVER derive
 * first_party.
 */
describe("deriveMcpTrustTier", () => {
  it("derives first_party for a registry server, regardless of the self-hosted-path flag", () => {
    expect(deriveMcpTrustTier("google-drive-mcp", false)).toBe("first_party");
    expect(deriveMcpTrustTier("google-drive-mcp", true)).toBe("first_party");
    expect(deriveMcpTrustTier("google-gmail-mcp", false)).toBe("first_party");
    expect(deriveMcpTrustTier("google-calendar-mcp", false)).toBe("first_party");
  });

  it("derives self_hosted for a self-hosted id via the self-hosted path", () => {
    const id = selfHostedServerId("https://mcp.acme.com");
    expect(deriveMcpTrustTier(id, true)).toBe("self_hosted");
  });

  it("derives untrusted for an unknown id not via the self-hosted path", () => {
    expect(deriveMcpTrustTier("totally-unknown-server", false)).toBe("untrusted");
  });

  it("NEVER derives first_party for a forged/unknown id (registry-wins invariant)", () => {
    // Via the self-hosted path, a forged id is at most self_hosted — never first_party.
    expect(deriveMcpTrustTier("forged-google-drive-mcp", true)).toBe(
      "self_hosted",
    );
    // Off the self-hosted path, a forged id is untrusted — never first_party.
    expect(deriveMcpTrustTier("forged-google-drive-mcp", false)).toBe(
      "untrusted",
    );
  });
});
