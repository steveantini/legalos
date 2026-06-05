"use server";

import { z } from "zod";

import { executeWorkflowRun, type WorkflowRunResult } from "@/lib/workflows/run";

/**
 * Start a workflow run from a stored definition (Workflows arc, Step 2). The
 * server-side run-trigger entry point — callable now (Step 4 builds the UI over
 * it). Auth + org scoping happen inside executeWorkflowRun via the user session;
 * this thin action validates the input shape and delegates.
 *
 * runInput is arbitrary jsonb (the workflow's starting value, consumed by the
 * first step's mapping), so it is passed through unvalidated by shape — the
 * definition's steps decide how to use it.
 */
const startSchema = z.object({ definitionId: z.string().uuid() });

export async function startWorkflowRun(
  definitionId: string,
  runInput?: unknown,
): Promise<WorkflowRunResult> {
  const parsed = startSchema.safeParse({ definitionId });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return executeWorkflowRun({
    definitionId: parsed.data.definitionId,
    runInput: runInput ?? null,
  });
}
