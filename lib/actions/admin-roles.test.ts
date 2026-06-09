import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the app-layer privilege-escalation gate (lib/actions/admin-roles).
 *
 * The role-change rule is enforced in three layers (D-041): the UI, this server
 * action, and the database trigger `enforce_user_role_change` (the authoritative
 * guard). The DB trigger is verified by RLS/integration tests (a deferred
 * live-Postgres harness); THESE tests lock in the APP-LAYER gate, which is real
 * and substantial here (not a pass-through to the trigger): it enforces authority,
 * org-scoping, the super_admin-grant restriction, the org_admin-cannot-touch-a-
 * super_admin rule, and the last-active-super-admin lockout protection, each with
 * a friendly message.
 *
 * The Supabase boundary is a small in-memory fake (the project's established
 * pattern, as in model-credential.test.ts): the users-table reads resolve from
 * the configured actor/target/count, so the action's decision logic runs exactly
 * as in production over controlled data.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  isCurrentUserOrgAdmin: vi.fn(),
  isCurrentUserSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/auth/access", () => ({
  isCurrentUserOrgAdmin: mocks.isCurrentUserOrgAdmin,
  isCurrentUserSuperAdmin: mocks.isCurrentUserSuperAdmin,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateUserRoleAction } from "./admin-roles";

// Valid uuid v4 strings (version nibble 4, variant nibble 8) so the action's
// zod `.uuid()` input gate passes and the authorization logic is exercised.
const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

interface DbConfig {
  /** The auth user, or null for "not signed in". */
  authUser: { id: string } | null;
  /** The actor's organization (returned for the actor's profile select). */
  actorOrg?: string;
  /** The target users row (id / organization_id / role). */
  target?: { id: string; organization_id: string; role: string };
  /** OTHER active super admins in the org (the count query result). */
  superAdminCount?: number;
  /** Error returned by the role UPDATE. */
  updateError?: { code: string } | null;
}

/** A faithful in-memory `users` client: maybeSingle resolves the actor profile or
 * the target by the `eq("id", ...)` value; the count query (select with head/count
 * options) and the update resolve by awaiting the chain. */
function makeDb(config: DbConfig) {
  return {
    auth: {
      getUser: async () => ({ data: { user: config.authUser } }),
    },
    from() {
      const q: {
        op: "select" | "update";
        count: boolean;
        eqs: Record<string, unknown>;
      } = { op: "select", count: false, eqs: {} };
      const b = {
        select(_cols: string, opts?: { head?: boolean; count?: string }) {
          if (opts && (opts.head || opts.count)) q.count = true;
          return b;
        },
        update() {
          q.op = "update";
          return b;
        },
        eq(c: string, v: unknown) {
          q.eqs[c] = v;
          return b;
        },
        neq() {
          return b;
        },
        maybeSingle() {
          const id = q.eqs.id;
          if (config.authUser && id === config.authUser.id) {
            return Promise.resolve({
              data: { organization_id: config.actorOrg ?? null },
              error: null,
            });
          }
          if (config.target && id === config.target.id) {
            return Promise.resolve({ data: config.target, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          if (q.op === "update") {
            return Promise.resolve({ error: config.updateError ?? null }).then(
              resolve,
              reject,
            );
          }
          if (q.count) {
            return Promise.resolve({
              count: config.superAdminCount ?? 0,
              error: null,
            }).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return b;
    },
  };
}

function formData(targetId: string, newRole: string): FormData {
  const fd = new FormData();
  fd.set("target_user_id", targetId);
  fd.set("new_role", newRole);
  return fd;
}

/** Configure the action's environment for one scenario. */
function setup(opts: {
  authUser?: { id: string } | null;
  orgAdmin?: boolean;
  superAdmin?: boolean;
  db: DbConfig;
}) {
  mocks.isCurrentUserOrgAdmin.mockResolvedValue(opts.orgAdmin ?? false);
  mocks.isCurrentUserSuperAdmin.mockResolvedValue(opts.superAdmin ?? false);
  mocks.createSupabaseServerClient.mockResolvedValue(makeDb(opts.db));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateUserRoleAction — authority + input gates", () => {
  it("rejects when not signed in", async () => {
    setup({ db: { authUser: null } });
    const r = await updateUserRoleAction(formData(TARGET_ID, "org_admin"));
    expect(r).toEqual({ ok: false, error: "You must be signed in." });
  });

  it("rejects an actor who is not an org admin", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: false,
      db: { authUser: { id: ACTOR_ID } },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "org_admin"));
    expect(r).toEqual({ ok: false, error: "You don't have permission to do that." });
  });

  it("rejects an invalid role value", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      db: { authUser: { id: ACTOR_ID }, actorOrg: "org-1" },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "owner"));
    expect(r).toEqual({ ok: false, error: "Invalid request." });
  });

  it("rejects a target in a DIFFERENT organization (org-scoping, app-enforced)", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      db: {
        authUser: { id: ACTOR_ID },
        actorOrg: "org-1",
        target: { id: TARGET_ID, organization_id: "org-2", role: "user" },
      },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "org_admin"));
    expect(r).toEqual({ ok: false, error: "Invalid request." });
  });
});

describe("updateUserRoleAction — only super_admin grants super_admin", () => {
  it("REJECTS an org_admin granting super_admin", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      superAdmin: false,
      db: {
        authUser: { id: ACTOR_ID },
        actorOrg: "org-1",
        target: { id: TARGET_ID, organization_id: "org-1", role: "user" },
      },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "super_admin"));
    expect(r).toEqual({
      ok: false,
      error: "Only a super admin can grant the super admin role.",
    });
  });

  it("ALLOWS a super_admin granting super_admin", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      superAdmin: true,
      db: {
        authUser: { id: ACTOR_ID },
        actorOrg: "org-1",
        target: { id: TARGET_ID, organization_id: "org-1", role: "user" },
        updateError: null,
      },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "super_admin"));
    expect(r).toEqual({ ok: true });
  });

  it("REJECTS an org_admin changing a current super_admin's role", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      superAdmin: false,
      db: {
        authUser: { id: ACTOR_ID },
        actorOrg: "org-1",
        target: { id: TARGET_ID, organization_id: "org-1", role: "super_admin" },
      },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "user"));
    expect(r).toEqual({
      ok: false,
      error: "Only a super admin can change a super admin's role.",
    });
  });
});

describe("updateUserRoleAction — last super_admin lockout protection", () => {
  it("REJECTS demoting the last active super_admin (no other remains)", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      superAdmin: true,
      db: {
        authUser: { id: ACTOR_ID },
        actorOrg: "org-1",
        target: { id: TARGET_ID, organization_id: "org-1", role: "super_admin" },
        superAdminCount: 0,
      },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "user"));
    expect(r).toEqual({
      ok: false,
      error: "Your organization must keep at least one active super admin.",
    });
  });

  it("ALLOWS demoting a super_admin when another active super_admin remains", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      superAdmin: true,
      db: {
        authUser: { id: ACTOR_ID },
        actorOrg: "org-1",
        target: { id: TARGET_ID, organization_id: "org-1", role: "super_admin" },
        superAdminCount: 1,
        updateError: null,
      },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "user"));
    expect(r).toEqual({ ok: true });
  });
});

describe("updateUserRoleAction — ordinary changes + no-op", () => {
  it("ALLOWS an org_admin setting a user to org_admin (within authority)", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      superAdmin: false,
      db: {
        authUser: { id: ACTOR_ID },
        actorOrg: "org-1",
        target: { id: TARGET_ID, organization_id: "org-1", role: "user" },
        updateError: null,
      },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "org_admin"));
    expect(r).toEqual({ ok: true });
  });

  it("is a no-op (ok, no write) when the role is unchanged", async () => {
    setup({
      authUser: { id: ACTOR_ID },
      orgAdmin: true,
      superAdmin: false,
      db: {
        authUser: { id: ACTOR_ID },
        actorOrg: "org-1",
        // role already org_admin; the action returns ok before the count/update.
        target: { id: TARGET_ID, organization_id: "org-1", role: "org_admin" },
        // updateError set so that IF an update were attempted it would fail —
        // proving the no-op path never reaches the write.
        updateError: { code: "SHOULD_NOT_RUN" },
      },
    });
    const r = await updateUserRoleAction(formData(TARGET_ID, "org_admin"));
    expect(r).toEqual({ ok: true });
  });
});
