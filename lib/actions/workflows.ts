"use server";

import { z } from "zod";

import {
  executeWorkflowRun,
  resumeWorkflowApproval,
  type WorkflowRunResult,
} from "@/lib/workflows/run";

/**
 * Start a workflow run from a stored definition (Workflows arc, Steps 2-3). The
 * server-side run-trigger entry point — callable now (Step 4 builds the UI over
 * it). Auth + org scoping happen inside executeWorkflowRun via the user session.
 *
 * autonomyLevel is a RUN-level setting (default 'supervised', the v1 live
 * behavior: checkpoints + writes pause for approval). 'autonomous' may auto-clear
 * pure checkpoint gates but its writes STILL require approval in v1.
 *
 * runInput is arbitrary jsonb (the workflow's starting value, consumed by the
 * first step's mapping), passed through unvalidated by shape.
 */
const startSchema = z.object({
  definitionId: z.string().uuid(),
  autonomyLevel: z.enum(["supervised", "autonomous"]).default("supervised"),
});

export async function startWorkflowRun(
  definitionId: string,
  runInput?: unknown,
  autonomyLevel: "supervised" | "autonomous" = "supervised",
): Promise<WorkflowRunResult> {
  const parsed = startSchema.safeParse({ definitionId, autonomyLevel });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return executeWorkflowRun({
    definitionId: parsed.data.definitionId,
    runInput: runInput ?? null,
    autonomyLevel: parsed.data.autonomyLevel,
  });
}

/**
 * Record a decision (approve / deny) on a pending workflow approval and resume
 * the run (Step 3). Auth-gated to the run's owner via RLS; the atomic claim
 * inside the resume guarantees an approved write executes at most once. Callable
 * now; Step 4 builds the approval UI over it.
 */
const decideSchema = z.object({
  pendingApprovalId: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
});

export async function decideWorkflowApproval(
  pendingApprovalId: string,
  decision: "approve" | "deny",
): Promise<WorkflowRunResult> {
  const parsed = decideSchema.safeParse({ pendingApprovalId, decision });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return resumeWorkflowApproval({
    pendingApprovalId: parsed.data.pendingApprovalId,
    decision: parsed.data.decision,
  });
}
