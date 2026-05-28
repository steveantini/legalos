import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ConversationCard } from "./conversation-card";

const MAX_SNIPPET_CHARS = 60;

type ConversationRow = {
  id: string;
  agent_id: string;
  updated_at: string;
  // To-one FK embed (conversations.agent_id -> agents). PostgREST returns
  // a single object for a many-to-one embed; `one()` normalizes the rare
  // array-shaped inference defensively.
  agents: { name: string | null } | { name: string | null }[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

function truncateSnippet(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_SNIPPET_CHARS) return collapsed;
  return collapsed.slice(0, MAX_SNIPPET_CHARS).trimEnd() + "…";
}

/**
 * "Continue working" — the user's 3 most recently active conversations,
 * deep-linking back into the chat surface. Ordered by
 * `conversations.updated_at` (now bumped per message by the chat route +
 * indexed in migration 0042). Conversations whose agent has been deleted
 * or deactivated are filtered out via an inner join. Conversation titles
 * are never populated in this product, so each card shows the agent name
 * plus the first user message as a snippet.
 */
export async function ContinueWorkingSection({ userId }: { userId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("conversations")
    .select("id, agent_id, updated_at, agents!inner(name, deleted_at, is_active)")
    .eq("user_id", userId)
    .is("agents.deleted_at", null)
    .eq("agents.is_active", true)
    .order("updated_at", { ascending: false })
    .limit(3);

  const conversations = (data ?? []) as ConversationRow[];

  // First user message per conversation, for the snippet. Three small
  // lookups keyed by the (conversation_id, created_at) index — clearer
  // and more robust than a single nested-ordered-limit PostgREST embed.
  const snippetEntries = await Promise.all(
    conversations.map(async (conv) => {
      const { data: msg } = await supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", conv.id)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const content = (msg as { content: string } | null)?.content ?? null;
      return [conv.id, content ? truncateSnippet(content) : null] as const;
    }),
  );
  const snippetById = new Map(snippetEntries);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[18px] font-medium tracking-[-0.005em] text-foreground">
        Continue working
      </h2>
      {conversations.length === 0 ? (
        <p className="text-[14px] leading-[1.5] text-muted-foreground">
          Your recent conversations will show up here once you start working
          with an agent.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {conversations.map((conv) => (
            <ConversationCard
              key={conv.id}
              conversationId={conv.id}
              agentId={conv.agent_id}
              agentName={one(conv.agents)?.name ?? "Untitled agent"}
              snippet={snippetById.get(conv.id) ?? null}
              lastActivityAt={conv.updated_at}
            />
          ))}
        </div>
      )}
    </section>
  );
}
