import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cross-org isolation test for the inference-credential resolver (0066, the
 * multi-tenant security fix). This is the most important guarantee in that fix:
 * a bring-your-own model key saved by one org must NEVER resolve for another
 * org's inference.
 *
 * The fake admin client below is a faithful in-memory simulation of the
 * PostgREST filter chain: `.maybeSingle()` returns a row only when EVERY
 * recorded `.eq()`/`.is()` predicate matches. So if `resolveByoCredential` adds
 * `.eq("organization_id", orgB)` and only org A has a BYO row, the simulated DB
 * returns nothing for org B — exactly as a row-filtered query would. A
 * regression that dropped the org filter would make org B resolve org A's row
 * and fail these tests.
 *
 * What a fuller harness would add (noted, not built here): RLS-level tests
 * against a live Postgres confirming the org-fenced policies deny a cross-org
 * read/write at the database layer. These resolver-level tests cover the
 * service-role read path (which BYPASSES RLS and so relies on the explicit org
 * filter); the RLS layer is the defense-in-depth behind it.
 */

let currentAdmin: unknown;

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => currentAdmin,
}));
vi.mock("@/lib/connections/crypto", () => ({
  decryptApiKey: (ciphertext: string) => `decrypted:${ciphertext}`,
}));
vi.mock("@/lib/connections/providers/model-registry", () => ({
  getModelAdapter: (vendor: string) => (vendor === "anthropic" ? {} : null),
}));

import { resolveModelCredential } from "./model-credential";

type Row = Record<string, unknown>;

/** A faithful PostgREST-ish fake: eq/is accumulate predicates; maybeSingle
 * returns the first row matching ALL of them (so the org filter is enforced). */
function makeAdmin(connections: Row[], secrets: Record<string, string>) {
  return {
    from(table: string) {
      const preds: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          preds[col] = val;
          return builder;
        },
        is: (col: string, val: unknown) => {
          preds[col] = val;
          return builder;
        },
        limit: () => builder,
        maybeSingle: async () => {
          if (table === "connections") {
            const row = connections.find((r) =>
              Object.entries(preds).every(([k, v]) => r[k] === v),
            );
            return { data: row ?? null, error: null };
          }
          if (table === "connection_secrets") {
            const id = preds.id as string;
            const ciphertext = secrets[id];
            return { data: ciphertext ? { ciphertext } : null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };
}

const ORG_A = "org-a";
const ORG_B = "org-b";

const byoRow = (organizationId: string, tokenRef: string): Row => ({
  organization_id: organizationId,
  scope: "org",
  owner_user_id: null,
  provider_id: "anthropic",
  capability_category: "models",
  status: "active",
  credential_source: "byo",
  token_ref: tokenRef,
  base_url: null,
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "managed-platform-key";
});

describe("resolveModelCredential — BYO key cross-org isolation (0066)", () => {
  it("an org with a BYO key resolves ITS OWN key", async () => {
    currentAdmin = makeAdmin([byoRow(ORG_A, "secret-a")], { "secret-a": "cipher-a" });
    const cred = await resolveModelCredential({
      organizationId: ORG_A,
      userId: "u",
      vendor: "anthropic",
    });
    expect(cred.apiKey).toBe("decrypted:cipher-a");
  });

  it("a DIFFERENT org never resolves another org's BYO key — it falls back to the managed key", async () => {
    // Only org A has a BYO key. Org B must NOT get it.
    currentAdmin = makeAdmin([byoRow(ORG_A, "secret-a")], { "secret-a": "cipher-a" });
    const cred = await resolveModelCredential({
      organizationId: ORG_B,
      userId: "u",
      vendor: "anthropic",
    });
    expect(cred.apiKey).toBe("managed-platform-key");
    expect(cred.apiKey).not.toBe("decrypted:cipher-a");
  });

  it("two orgs each with their own BYO key resolve only their own", async () => {
    currentAdmin = makeAdmin(
      [byoRow(ORG_A, "secret-a"), byoRow(ORG_B, "secret-b")],
      { "secret-a": "cipher-a", "secret-b": "cipher-b" },
    );
    const a = await resolveModelCredential({
      organizationId: ORG_A,
      userId: "u",
      vendor: "anthropic",
    });
    const b = await resolveModelCredential({
      organizationId: ORG_B,
      userId: "u",
      vendor: "anthropic",
    });
    expect(a.apiKey).toBe("decrypted:cipher-a");
    expect(b.apiKey).toBe("decrypted:cipher-b");
  });
});
