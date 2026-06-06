"use server";

import { z } from "zod";

import {
  executeWorkflowRun,
  resumeWorkflowApproval,
  type WorkflowRunResult,
} from "@/lib/workflows/run";
import {
  deleteWorkflowDefinition as deleteWorkflowDefinitionImpl,
  saveWorkflowDefinition as saveWorkflowDefinitionImpl,
  type DeleteWorkflowResult,
  type SaveWorkflowInput,
  type SaveWorkflowResult,
} from "@/lib/workflows/authoring";

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

/**
 * Create or update a workflow definition from the builder (Step 4a). The builder
 * sends the canonical step graph directly; this validates the outer shape, then
 * delegates to the authoring layer, which runs the SAME engine validator before
 * persisting. Org-admin gated inside the authoring layer (RLS re-enforces).
 */
const saveSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  departmentId: z.string().uuid().nullable(),
  status: z.enum(["draft", "active"]),
});

export async function saveWorkflowDefinition(
  input: SaveWorkflowInput,
): Promise<SaveWorkflowResult> {
  const parsed = saveSchema.safeParse({
    id: input.id,
    name: input.name,
    description: input.description,
    departmentId: input.departmentId,
    status: input.status,
  });
  if (!parsed.success) {
    return { ok: false, error: "Check the workflow name and details." };
  }
  // `steps` is the canonical graph; the authoring layer validates it at the data
  // boundary with the engine validator.
  return saveWorkflowDefinitionImpl({ ...parsed.data, steps: input.steps });
}

/**
 * Delete a workflow definition (Workflow arc polish). Org-admin gated inside
 * the authoring layer (RLS re-enforces). Run history survives: runs keep their
 * own definition snapshot, and the runs FK is set-null on delete (0060).
 */
const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteWorkflowDefinition(
  id: string,
): Promise<DeleteWorkflowResult> {
  const parsed = deleteSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return deleteWorkflowDefinitionImpl(parsed.data.id);
}
