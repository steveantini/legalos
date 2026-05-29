import "server-only";

import { cache } from "react";

import type { Capability, ConnectionPolicy } from "@/lib/settings/connections";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Connection-policy enforcement — the single source of truth for "is this
 * allowed?" across every connection operation (D-066).
 *
 * The connector hub's governing principle is govern-before-exercise: a
 * capability must be enforced against policy before it is exercised. Every path
 * that creates a connection, grants a capability, or (in M6) exercises one calls
 * these helpers, so enforcement can never drift between call sites:
 *
 *   - initiate route  → isConnectionAllowed (gate before OAuth starts)
 *   - callback route  → isConnectionAllowed (defense-in-depth re-check) +
 *                       constrainCapabilitiesToCeiling (grant ≤ ceiling)
 *   - M6 exercise path → canExerciseCapability (live policy + grant check)
 *
 * Policy is the singleton `connection_policy` row (migration 0044): allowed
 * categories, allowed providers, and the default capability ceiling (the max a
 * user may self-grant without admin approval, seeded read-only). There is no
 * admin editing UI in this arc — the policy stays at its seeded defaults and is
 * changed directly in the database until the future Admin arc designs the
 * surface; this module reads whatever the row holds, so an eventual editor
 * needs no enforcement rework.
 *
 * Server-only: reads policy and connection state with the RLS-scoped per-request
 * client (any authenticated user may read the policy; connection reads are
 * grant-scoped by RLS). Application-layer enforcement here plus RLS (M3) are
 * defense-in-depth layers.
 */

const POLICY_ID = 1;

// Fail-closed default, used ONLY if the singleton policy row can't be read
// (missing or a transient DB error). Empty arrays deny everything: no category
// or provider is allowed and nothing may be granted. The row is seeded by
// migration 0044, so normal operation always returns the real policy; this
// default exists so a read failure denies rather than silently permitting
// (backend-security.md: fail closed).
const FAIL_CLOSED_POLICY: ConnectionPolicy = {
  id: POLICY_ID,
  allowed_categories: [],
  allowed_providers: [],
  default_capability_ceiling: [],
  updated_by_user_id: null,
  updated_at: "",
};

// Embed shape for the grant-plus-connection read in canExerciseCapability. The
// untyped server client is asserted to this shape at the boundary; the single FK
// (connection_grants.connection_id) returns one embedded `connections` object.
type GrantConnectionRow = {
  capabilities: string[] | null;
  connections: {
    id: string;
    token_ref: string | null;
    capability_category: string;
    status: string;
  };
};

/**
 * Read the singleton connection policy. Wrapped in React's `cache()` so the
 * several enforcement calls within one request (e.g. a route that checks the
 * provider, the category, and the ceiling) resolve to a single DB read.
 * Per-request memoization only — never leaks across requests.
 */
export const getConnectionPolicy = cache(async (): Promise<ConnectionPolicy> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("connection_policy")
    .select(
      "id, allowed_categories, allowed_providers, default_capability_ceiling, updated_by_user_id, updated_at",
    )
    .eq("id", POLICY_ID)
    .maybeSingle();

  if (error || !data) return FAIL_CLOSED_POLICY;

  const row = data as {
    id: number;
    allowed_categories: string[] | null;
    allowed_providers: string[] | null;
    default_capability_ceiling: string[] | null;
    updated_by_user_id: string | null;
    updated_at: string;
  };

  return {
    id: row.id,
    allowed_categories: row.allowed_categories ?? [],
    allowed_providers: row.allowed_providers ?? [],
    default_capability_ceiling: (row.default_capability_ceiling ?? []) as Capability[],
    updated_by_user_id: row.updated_by_user_id,
    updated_at: row.updated_at,
  };
});

/** Whether a capability category is in the policy's allowed categories. */
export async function isCategoryAllowed(category: string): Promise<boolean> {
  const policy = await getConnectionPolicy();
  return policy.allowed_categories.includes(category);
}

/** Whether a provider is in the policy's allowed providers. */
export async function isProviderAllowed(providerId: string): Promise<boolean> {
  const policy = await getConnectionPolicy();
  return policy.allowed_providers.includes(providerId);
}

/**
 * Combined gate the initiate route uses before starting OAuth: both the provider
 * AND its capability category must be allowed.
 */
export async function isConnectionAllowed(
  providerId: string,
  category: string,
): Promise<boolean> {
  const policy = await getConnectionPolicy();
  return (
    policy.allowed_providers.includes(providerId) &&
    policy.allowed_categories.includes(category)
  );
}

/** The policy's default capability ceiling (the max a user may self-grant). */
export async function getCapabilityCeiling(): Promise<Capability[]> {
  const policy = await getConnectionPolicy();
  return policy.default_capability_ceiling;
}

/**
 * Intersect the capabilities a flow wants to grant with the policy ceiling, so a
 * self-grant can never exceed policy. Order/dedupe follow the requested list.
 * E.g. requested ['read','write'] with ceiling ['read'] → ['read'].
 */
export async function constrainCapabilitiesToCeiling(
  requested: Capability[],
): Promise<Capability[]> {
  const ceiling = await getCapabilityCeiling();
  return requested.filter((capability) => ceiling.includes(capability));
}

/** Why a capability exercise was denied (for callers/logging; no PII). */
export type CapabilityDenialReason =
  // Category not allowed, or the capability is above the current ceiling — the
  // live-policy gate (catches a since-tightened policy, not just grant-time).
  | "policy_disallows"
  // No active connection in this category that the user can use.
  | "no_active_connection"
  // A usable connection exists, but the user's grant lacks the capability.
  | "capability_not_granted";

/**
 * The decision a capability-exercise path acts on. On allow it carries enough
 * for the caller (M6) to act: which connection, and its token reference (the
 * connection_secrets id — NOT the secret itself; M6 resolves the secret
 * server-side via the service-role client).
 */
export type CapabilityExerciseDecision =
  | {
      allowed: true;
      connectionId: string;
      tokenRef: string | null;
      capabilities: Capability[];
    }
  | { allowed: false; reason: CapabilityDenialReason };

/**
 * The govern-before-exercise gate. M6 (and any future capability-exercise path)
 * calls this before letting an agent USE a connection — e.g. before reading
 * Drive files. Allows only when ALL hold:
 *
 *   1. Live policy permits it: the category is allowed AND the capability is
 *      within the current ceiling. Checked live, so a policy tightened after a
 *      grant was minted still constrains that older grant.
 *   2. The user holds a grant on an ACTIVE connection in the category (own
 *      personal connection, or an org connection granted to them — RLS scopes
 *      the read to grants the user actually holds).
 *   3. That grant includes the requested capability.
 *
 * Today this returns allow only for an active Drive connection with a read grant
 * in file-storage (the only connectable provider, read-only ceiling); everything
 * else denies.
 */
export async function canExerciseCapability(
  userId: string,
  category: string,
  capability: Capability,
): Promise<CapabilityExerciseDecision> {
  // 1. Live policy gate.
  const policy = await getConnectionPolicy();
  if (
    !policy.allowed_categories.includes(category) ||
    !policy.default_capability_ceiling.includes(capability)
  ) {
    return { allowed: false, reason: "policy_disallows" };
  }

  // 2. An active connection in this category the user holds a grant on. The
  //    !inner join + grantee filter means RLS and the query both scope to the
  //    user's own usable connections.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("connection_grants")
    .select(
      "capabilities, connections!inner(id, token_ref, capability_category, status)",
    )
    .eq("grantee_user_id", userId)
    .eq("connections.capability_category", category)
    .eq("connections.status", "active")
    .limit(1);

  if (error || !data || data.length === 0) {
    return { allowed: false, reason: "no_active_connection" };
  }

  const row = (data as unknown as GrantConnectionRow[])[0];
  const capabilities = (row.capabilities ?? []) as Capability[];

  // 3. The grant must include the requested capability.
  if (!capabilities.includes(capability)) {
    return { allowed: false, reason: "capability_not_granted" };
  }

  return {
    allowed: true,
    connectionId: row.connections.id,
    tokenRef: row.connections.token_ref,
    capabilities,
  };
}
