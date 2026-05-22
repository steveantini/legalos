"use server";

import { getAgent, requireAuthUser } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Heavy fields the read-only details panel needs but the launchpad
 * card grid does not. Pulled lazily when the panel opens so the
 * department-page RSC payload doesn't carry every visible agent's
 * authored prompt text (~150KB for the Commercial department
 * post-C4L-import).
 */
export interface AgentDetailsData {
  system_prompt: string | null;
  tools_enabled: string[];
  attachments: Array<{ originalFilename: string }>;
}

export type AgentDetailsResult =
  | { ok: true; data: AgentDetailsData }
  | { ok: false; error: string };

/**
 * Lazy-fetch system prompt, tool list, and attachments for a single
 * agent. Called by the read-only details panel on open.
 *
 * Authorization runs through `getAgent`, which is RLS-scoped — returns
 * null for any agent the caller can't see, and this action surfaces a
 * generic "not found or not accessible" error. The launchpad cannot
 * leak a hidden agent through this surface.
 *
 * Attachments are read via the per-request server client, which carries
 * the caller's JWT and is RLS-scoped against
 * `agent_attachments_user_owns` / `_admin_read` (migration 0007). A
 * non-admin reading a Canonical or C4L agent's attachments will receive
 * an empty array — expected.
 */
export async function getAgentDetailsAction(
  agentId: string,
): Promise<AgentDetailsResult> {
  try {
    await requireAuthUser();

    const agent = await getAgent(agentId);
    if (!agent) {
      return { ok: false, error: "Agent not found or not accessible." };
    }

    const supabase = await createSupabaseServerClient();
    const { data: attachmentRows } = await supabase
      .from("agent_attachments")
      .select("original_filename")
      .eq("agent_id", agentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    return {
      ok: true,
      data: {
        system_prompt: agent.system_prompt,
        tools_enabled: Array.isArray(agent.tools_enabled)
          ? (agent.tools_enabled as unknown as string[])
          : [],
        attachments: (attachmentRows ?? []).map((row) => ({
          originalFilename: row.original_filename as string,
        })),
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
