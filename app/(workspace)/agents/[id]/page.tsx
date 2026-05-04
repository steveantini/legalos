import { notFound } from "next/navigation";

import { AgentHeader } from "@/components/chat/agent-header";
import { ChatInterface } from "@/components/chat/chat-interface";
import { getAgent, requireAuthUser } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Native-agent chat page. Mirrors the access-control idiom from
 * `/departments/[slug]`: a single `notFound()` covers
 *
 *   - the agent doesn't exist
 *   - the agent is inactive
 *   - the agent isn't of type 'native' (only natives are chattable)
 *   - the user lacks access to the agent's department (RLS-hidden)
 *
 * The layout's `getAgent` call gates RLS-hidden + missing at the layout
 * level. This page narrows further on type/active in code, since
 * `getAgent` returns the unified shape regardless of those flags. Net
 * behavior identical to the legacy inline query (which filtered with
 * `.eq("is_active", true).eq("type", "native")`).
 *
 * `/api/chat` re-validates everything on every send (auth, agent, dept
 * access, rate limit), so the checks here are belt-and-suspenders for
 * the page-load path. A user who races a department-access revocation
 * between page load and a send will be cleanly stopped at the route
 * handler.
 *
 * Soft-deleted agents (`deleted_at IS NOT NULL`) keep their chat surface
 * accessible — the transcript is the conversational record per
 * architecture §3 — but the message-input branches into a disabled
 * "deleted" state inside `ChatInterface` so new sends are not possible
 * until the agent is restored from `/agents/trash`.
 *
 * Layout sizing: the workspace layout's body wrapper is a flex column
 * with `min-h-0 overflow-auto`. `flex-1 min-h-0` lets this `<main>`
 * fill the column's remaining height while permitting `ChatInterface`'s
 * internal scroll to activate as designed (visual chat redesign is a
 * separate session — this is the structural sizing fix only).
 */
export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuthUser();
  const { id } = await params;
  const agent = await getAgent(id);

  if (!agent || agent.type !== "native" || !agent.is_active) {
    notFound();
  }

  const isOwner = agent.created_by === user.id;
  const isDeleted = agent.deleted_at !== null;
  // Defensive read of tools_enabled (jsonb on the DB; typed as `unknown`
  // through the helper). Mirrors the same shape check `<AgentHeader>` uses
  // on its meta-chip side; both consumers should land on the same boolean.
  const webSearchEnabled =
    Array.isArray(agent.tools_enabled) &&
    (agent.tools_enabled as unknown[]).includes("web_search");

  // Active attachment count for the header's meta chip — head-only count
  // query, no rows returned. Single inline read; if a second consumer
  // surfaces, extract `getAgentAttachmentCount(id)` to lib/auth/access.ts.
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("agent_attachments")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agent.id)
    .is("deleted_at", null);
  const attachmentCount = count ?? 0;

  return (
    <main className="scrollbar-stable mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden">
      <AgentHeader
        agent={agent}
        attachmentCount={attachmentCount}
        isOwner={isOwner}
        isDeleted={isDeleted}
      />
      <ChatInterface
        agentId={agent.id}
        agentName={agent.name}
        agentDescription={agent.description}
        agentModel={agent.model ?? ""}
        webSearchEnabled={webSearchEnabled}
        isDeleted={isDeleted}
      />
    </main>
  );
}
