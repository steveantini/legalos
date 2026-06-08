/**
 * Pure logic for the reset-demo-org script (Step 2, Part B). The script runs
 * with the service-role key, which bypasses RLS, so it is the most dangerous
 * code in the demo-access effort. Every decision that keeps it from touching a
 * real org lives HERE as a pure function, so each guard is unit-tested with
 * plain objects rather than trusted to a live run.
 */

export interface OrgRow {
  id: string;
  is_demo: boolean;
  slug?: string | null;
}

export interface ResetGuardInput {
  /** The --org-id the operator passed. Required; there is no default. */
  orgIdArg: string | undefined;
  /** The org loaded for that id (null if not found). */
  org: OrgRow | null;
  /** The resolved real org id (oldest is_demo = false) for the inequality guard. */
  realOrgId: string | null;
}

export type ResetGuardResult = { ok: true } | { ok: false; reason: string };

/**
 * The layered guard. EVERY check must pass before the script performs any
 * write. The checks are ordered cheapest-first and each returns a specific,
 * non-leaky reason so an aborted run prints exactly why.
 */
export function evaluateResetGuard(input: ResetGuardInput): ResetGuardResult {
  // 1. An explicit --org-id is mandatory — no "find the demo org and nuke it".
  if (!input.orgIdArg || input.orgIdArg.trim() === "") {
    return {
      ok: false,
      reason:
        "Missing --org-id. Pass the demo org id explicitly (there is no default).",
    };
  }
  // 2. The org must exist.
  if (!input.org) {
    return { ok: false, reason: `No organization found for id ${input.orgIdArg}.` };
  }
  // 3. The loaded org must be exactly the one requested (no substitution).
  if (input.org.id !== input.orgIdArg) {
    return {
      ok: false,
      reason: "Loaded org id does not match the requested --org-id.",
    };
  }
  // 4. The target MUST be a demo org.
  if (input.org.is_demo !== true) {
    return {
      ok: false,
      reason: `Refusing: org ${input.org.id} is not a demo org (is_demo is not true).`,
    };
  }
  // 5. We must know the real org id to assert inequality.
  if (!input.realOrgId) {
    return {
      ok: false,
      reason: "Could not resolve the real org id for the inequality guard.",
    };
  }
  // 6. The target MUST NOT be the real org.
  if (input.org.id === input.realOrgId) {
    return {
      ok: false,
      reason: `Refusing: target org ${input.org.id} is the real org.`,
    };
  }
  return { ok: true };
}

/** One scoped delete: a table cleared by organization_id = the validated demo
 * org id, optionally restricted to user-created rows. */
export interface ScopedDelete {
  table: string;
  organizationId: string;
  /** When true, restrict to rows with a non-null created_by (user-created),
   * preserving seeded rows. Used for agents. */
  createdByNotNull?: boolean;
}

/**
 * The soft-reset deletion plan: the accumulated/mutable rows to clear, each
 * BOUND to the validated demo org id. Returned as data so a test can assert
 * that every operation is org-scoped and the script cannot issue an unscoped
 * delete. Order matters: rows referenced by `agents` via ON DELETE RESTRICT
 * (usage_events.agent_id, conversations.agent_id) are deleted before agents;
 * `conversations` cascades to messages, `workflow_runs` cascades to
 * workflow_step_runs, so those children are not listed.
 */
export function buildResetDeletes(demoOrgId: string): ScopedDelete[] {
  const t = (table: string, createdByNotNull = false): ScopedDelete => ({
    table,
    organizationId: demoOrgId,
    createdByNotNull,
  });
  return [
    t("mcp_paused_runs"),
    t("workflow_pending_approvals"),
    t("workflow_runs"), // cascades workflow_step_runs
    t("workflow_definitions"),
    t("formatted_outputs"),
    t("message_attachments"),
    t("agent_attachments"),
    t("usage_events"), // before agents (agent_id ON DELETE RESTRICT)
    t("conversations"), // before agents; cascades messages
    t("role_change_audit"),
    t("user_status_audit"),
    t("agents", true), // user-created only; seeded agents restored afterward
  ];
}
