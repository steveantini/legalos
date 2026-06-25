import { notFound } from "next/navigation";

import { ChatInterface } from "@/components/chat/chat-interface";
import { hasDocumentComparePreStep } from "@/lib/agents/capabilities";
import { isFullyLockedSource } from "@/lib/agents/lock";
import {
  getAgent,
  getConversationForChatSurface,
  isCurrentUserOrgAdmin,
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
  // The Document Comparison agent (and any fork of it, which carries the
  // capability) gets the role-aware two-document composer instead of the generic
  // attachment input. Detected via the deterministic pre-step capability (D-188).
  const documentCompareEnabled = hasDocumentComparePreStep(agent.tools_enabled);
  // Templates surface an Edit-vs-Customize top-right action in
  // AgentHeader. canManageTemplates is only fetched
  // when the agent is a template (templates with no admin viewer get the
  // Customize button; admin viewers get the Edit link instead).
  const isTemplate = agent.is_template;
  const canManageTemplates = isTemplate ? await isCurrentUserOrgAdmin() : false;

  // Count agent attachments for AgentHeader's "N attached" chip.
  // RLS via agent_attachments_user_owns (migration 0007) scopes to the
  // user's own rows; the page-level guard already established `isOwner`,
  // so this query returns either the owner's attachments or empty.
  const supabase = await createSupabaseServerClient();
  const { data: attachmentRows } = await supabase
    .from("agent_attachments")
    .select("id, original_filename, size_bytes")
    .eq("agent_id", agent.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const attachments = (attachmentRows ?? []).map((r) => ({
    id: r.id as string,
    originalFilename: r.original_filename as string,
    sizeBytes: Number(r.size_bytes),
  }));

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

  // AgentHeader is rendered inside ChatInterface (mounted there rather
  // than at the page level because ChatInterface owns the header's
  // live-conversation context — e.g. the Customize button needs the
  // active conversationId). The page's job shrinks to data load + access
  // checks; the chat surface owns its own internal layout (header +
  // messages + composer) end-to-end.
  return (
    <main className="scrollbar-stable mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden">
      <ChatInterface
        agentId={agent.id}
        agentName={agent.name}
        agentDescription={agent.description}
        agentModel={agent.model ?? ""}
        webSearchEnabled={webSearchEnabled}
        documentCompareEnabled={documentCompareEnabled}
        isDeleted={isDeleted}
        isOwner={isOwner}
        isTemplate={isTemplate}
        canManageTemplates={canManageTemplates}
        isFullyLocked={isFullyLockedSource(agent.source_origin)}
        agentAttachmentCount={attachments.length}
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
      attachments: row.attachments,
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
