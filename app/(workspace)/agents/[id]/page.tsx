import { notFound } from "next/navigation";

import { AgentHeader } from "@/components/chat/agent-header";
import { ChatInterface } from "@/components/chat/chat-interface";
import {
  getAgent,
  getConversationForChatSurface,
  requireAuthUser,
  type ConversationMessage,
} from "@/lib/auth/access";
import type {
  ChatSource,
  ChatToolCall,
} from "@/lib/chat/sse-parser";
import type { ChatMessage } from "@/components/chat/message-bubble";
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
 * `/api/chat` re-validates everything on every send (auth, agent, dept
 * access, rate limit), so the checks here are belt-and-suspenders for
 * the page-load path.
 *
 * Conversation reload (Session 18b): when the URL carries `?c=<conv_id>`,
 * the page hydrates the chat surface with that conversation's messages
 * (and its sources / tool_calls JSONB) so a hard-reload of an active
 * chat preserves the trace cards, citation markers, and sources list.
 * Bad / foreign / wrong-agent ids fall through to a fresh conversation
 * silently — `getConversationForChatSurface` returns null on any of
 * those, and the chat surface boots empty exactly as it did before
 * Session 18.
 *
 * Soft-deleted agents (`deleted_at IS NOT NULL`) keep their chat surface
 * accessible — the transcript is the conversational record per
 * architecture §3 — but the message-input branches into a disabled
 * "deleted" state inside `ChatInterface` so new sends are not possible
 * until the agent is restored from `/agents/trash`.
 */
export default async function AgentChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireAuthUser();
  const { id } = await params;
  const { c: conversationParam } = await searchParams;
  const agent = await getAgent(id);

  if (!agent || agent.type !== "native" || !agent.is_active) {
    notFound();
  }

  const isOwner = agent.created_by === user.id;
  const isDeleted = agent.deleted_at !== null;
  const webSearchEnabled =
    Array.isArray(agent.tools_enabled) &&
    (agent.tools_enabled as unknown[]).includes("web_search");

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("agent_attachments")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agent.id)
    .is("deleted_at", null);
  const attachmentCount = count ?? 0;

  // ---- Optional conversation hydration ----
  // Validate the param shape before the DB call so a malformed `?c=foo`
  // doesn't traverse into PostgREST. UUID v4-ish regex is fine here —
  // the DB will reject anything malformed anyway, but cheap pre-check.
  let initialMessages: ChatMessage[] = [];
  let initialConversationId: string | null = null;
  if (conversationParam && /^[0-9a-fA-F-]{36}$/.test(conversationParam)) {
    const convo = await getConversationForChatSurface(
      conversationParam,
      agent.id,
      user.id,
    );
    if (convo) {
      initialConversationId = convo.id;
      initialMessages = convo.messages.map(messageRowToChatMessage);
    }
  }

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
        initialMessages={initialMessages}
        initialConversationId={initialConversationId}
      />
    </main>
  );
}

/**
 * Coerce a hydrated `messages` row into the in-memory ChatMessage shape.
 * Skips system rows (none exist in v1; defensive against future ones)
 * and normalizes JSONB unknowns into typed arrays.
 */
function messageRowToChatMessage(row: ConversationMessage): ChatMessage {
  if (row.role === "user") {
    return {
      id: row.id,
      role: "user",
      content: row.content,
      sources: [],
      toolCalls: [],
    };
  }
  if (row.role === "system") {
    return {
      id: row.id,
      role: "system",
      content: row.content,
      sources: [],
      toolCalls: [],
    };
  }
  // assistant
  return {
    id: row.id,
    role: "assistant",
    content: row.content,
    sources: Array.isArray(row.sources) ? (row.sources as ChatSource[]) : [],
    toolCalls: Array.isArray(row.tool_calls)
      ? (row.tool_calls as ChatToolCall[])
      : [],
  };
}
