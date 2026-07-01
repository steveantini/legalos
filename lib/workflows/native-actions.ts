import "server-only";

import { runRenewalScan } from "@/lib/workflows/renewal-watcher";
import {
  NATIVE_ACTIONS_SERVER_ID,
  RENEWAL_SCAN_ACTION,
  isNativeAction,
} from "@/lib/workflows/native-actions-shared";

export { NATIVE_ACTIONS_SERVER_ID, RENEWAL_SCAN_ACTION, isNativeAction };

/**
 * Dispatch a native workflow action (watcher arc, Stage 2, D-221). Called from
 * the engine's tool_action resolver (`buildEngineDeps.runToolActionStep`) when a
 * step targets the reserved native serverId, BEFORE the MCP target lookup —
 * mirroring the chat loop's research_collections native tool. Runs inline (an
 * internal effect, never an external write), so it never pauses for approval.
 *
 * Returns the tool_action's executed outcome shape: { ok, output, error }. Never
 * throws (each handler is itself never-throws); an unknown action is an honest
 * failed step.
 */
export async function runNativeAction(params: {
  toolName: string;
  supabase: Parameters<typeof runRenewalScan>[0]["supabase"];
  organizationId: string;
  workflowRunId: string;
  args: Record<string, unknown>;
}): Promise<{ ok: boolean; output: unknown; error?: string }> {
  const { toolName, supabase, organizationId, workflowRunId, args } = params;

  if (toolName === RENEWAL_SCAN_ACTION) {
    // The watcher config rides the run input (the schedule's run_input plus the
    // cron-injected scheduleId), mapped onto the step's `config` arg.
    return runRenewalScan({
      supabase,
      organizationId,
      workflowRunId,
      config: args.config,
    });
  }

  return { ok: false, output: null, error: `Unknown native action "${toolName}".` };
}
