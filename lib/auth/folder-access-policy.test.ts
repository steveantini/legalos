import { describe, expect, it } from "vitest";

import {
  autoFolderDedupKey,
  canReadCollection,
  canWriteCollection,
  memberCanManageCollection,
  resolveFolderSetupScope,
  type CollectionFacts,
  type Viewer,
} from "./folder-access-policy";

/**
 * Adversarial decision-table for member self-service (Phase C1). This proves the
 * RULE LOGIC; the SQL suite proves the actual RLS. Cast of users mirrors the SQL
 * fixtures: A and B are members of org1, plus an org_admin and a super_admin in
 * org1, and C is a member of org2.
 */

const A = "user-A";
const B = "user-B";

function member(userId: string, opts: Partial<Viewer> = {}): Viewer {
  return { role: "user", userId, inDepartments: false, sameOrg: true, ...opts };
}
const orgAdmin: Viewer = { role: "org_admin", userId: "oa", inDepartments: false, sameOrg: true };
const superAdmin: Viewer = { role: "super_admin", userId: "sa", inDepartments: false, sameOrg: true };
const crossOrg: Viewer = { role: "user", userId: "C", inDepartments: false, sameOrg: false };

const aPrivate: CollectionFacts = { visibility: "private", ownerId: A };
const orgWide: CollectionFacts = { visibility: "org", ownerId: "sa" };
const deptScoped: CollectionFacts = { visibility: "departments", ownerId: "sa" };

describe("canReadCollection — private is owner + super_admin only", () => {
  it("owner A reads own private", () => expect(canReadCollection(member(A), aPrivate)).toBe(true));
  it("member B CANNOT read A's private", () => expect(canReadCollection(member(B), aPrivate)).toBe(false));
  it("ORG_ADMIN CANNOT read A's private (the leak guard)", () =>
    expect(canReadCollection(orgAdmin, aPrivate)).toBe(false));
  it("super_admin reads A's private", () => expect(canReadCollection(superAdmin, aPrivate)).toBe(true));
  it("cross-org CANNOT read A's private", () => expect(canReadCollection(crossOrg, aPrivate)).toBe(false));
  it("everyone in org reads org-wide", () => {
    expect(canReadCollection(member(B), orgWide)).toBe(true);
    expect(canReadCollection(orgAdmin, orgWide)).toBe(true);
  });
  it("cross-org cannot read org-wide", () => expect(canReadCollection(crossOrg, orgWide)).toBe(false));
  it("departments: org_admin and in-dept members read; outsiders don't", () => {
    expect(canReadCollection(orgAdmin, deptScoped)).toBe(true);
    expect(canReadCollection(member(B, { inDepartments: true }), deptScoped)).toBe(true);
    expect(canReadCollection(member(B, { inDepartments: false }), deptScoped)).toBe(false);
  });
  it("an owner-null private (deleted owner) is super_admin-only", () => {
    const orphan: CollectionFacts = { visibility: "private", ownerId: null };
    expect(canReadCollection(member(A), orphan)).toBe(false);
    expect(canReadCollection(superAdmin, orphan)).toBe(true);
  });
});

describe("canWriteCollection — member confined to own private + toggle", () => {
  it("A writes own private when toggle on", () => expect(canWriteCollection(member(A), aPrivate, true)).toBe(true));
  it("toggle OFF blocks A's private write", () => expect(canWriteCollection(member(A), aPrivate, false)).toBe(false));
  it("B cannot write A's private", () => expect(canWriteCollection(member(B), aPrivate, true)).toBe(false));
  it("member cannot create an org collection (must be private)", () =>
    expect(canWriteCollection(member(A), { visibility: "org", ownerId: A }, true)).toBe(false));
  it("member cannot move private -> org (result visibility org fails)", () =>
    expect(canWriteCollection(member(A), { visibility: "org", ownerId: A }, true)).toBe(false));
  it("super_admin writes regardless of toggle", () => {
    expect(canWriteCollection(superAdmin, aPrivate, false)).toBe(true);
    expect(canWriteCollection(superAdmin, orgWide, false)).toBe(true);
  });
  it("cross-org cannot write", () => expect(canWriteCollection(crossOrg, aPrivate, true)).toBe(false));
});

describe("resolveFolderSetupScope — server picks scope, never org for a member", () => {
  it("super_admin -> org, owner null", () =>
    expect(resolveFolderSetupScope("super_admin", "sa", false)).toEqual({
      allowed: true,
      visibility: "org",
      ownerUserId: null,
    }));
  it("member + toggle on -> private + self", () =>
    expect(resolveFolderSetupScope("user", A, true)).toEqual({
      allowed: true,
      visibility: "private",
      ownerUserId: A,
    }));
  it("member + toggle OFF -> not allowed", () =>
    expect(resolveFolderSetupScope("user", A, false).allowed).toBe(false));
  it("member never resolves to org visibility", () =>
    expect(resolveFolderSetupScope("user", A, true).visibility).toBe("private"));
  it("unauthenticated (null id) -> not allowed", () =>
    expect(resolveFolderSetupScope("user", null, true).allowed).toBe(false));
});

describe("memberCanManageCollection — the definer ownership gate", () => {
  it("owner + toggle -> can manage", () => expect(memberCanManageCollection(member(A), aPrivate, true)).toBe(true));
  it("non-owner -> cannot", () => expect(memberCanManageCollection(member(B), aPrivate, true)).toBe(false));
  it("toggle off -> cannot", () => expect(memberCanManageCollection(member(A), aPrivate, false)).toBe(false));
  it("org collection -> cannot (definer is private-only)", () =>
    expect(memberCanManageCollection(member(A), { visibility: "org", ownerId: A }, true)).toBe(false));
  it("cross-org -> cannot", () => expect(memberCanManageCollection(crossOrg, aPrivate, true)).toBe(false));
});

describe("autoFolderDedupKey — per-owner private, folder-wide org", () => {
  const conn = "conn1";
  const folder = "folderF";
  it("A re-picking the same folder reuses (same key)", () =>
    expect(autoFolderDedupKey(conn, folder, A)).toBe(autoFolderDedupKey(conn, folder, A)));
  it("A and B over the SAME folder get DIFFERENT keys (no collision, separate collections)", () =>
    expect(autoFolderDedupKey(conn, folder, A)).not.toBe(autoFolderDedupKey(conn, folder, B)));
  it("org auto-folders dedup folder-wide (owner null)", () =>
    expect(autoFolderDedupKey(conn, folder, null)).toBe(autoFolderDedupKey(conn, folder, null)));
  it("a private key never equals the org key for the same folder", () =>
    expect(autoFolderDedupKey(conn, folder, A)).not.toBe(autoFolderDedupKey(conn, folder, null)));
});
