import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatInterface } from "@/components/chat/chat-interface";
import { buttonVariants } from "@/components/ui/button";
import { requireAuthUser } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Native-agent chat page. Mirrors the access-control idiom from
 * /departments/[slug]: a single notFound() call covers
 *
 *   - the agent doesn't exist
 *   - the agent is inactive
 *   - the agent isn't of type 'native' (only natives are chattable)
 *   - the user lacks access to the agent's department
 *
 * RLS (`agents_read_accessible` in the 0001 schema) handles the
 * department-access part at the DB layer — the .select() returns no row
 * when the current user lacks `has_department_access(department_id)`.
 *
 * /api/chat re-validates everything on every send (auth, agent, dept
 * access, rate limit), so the checks here are belt-and-suspenders for the
 * page-load path. A user who races a department-access revocation between
 * the page load and a send will be cleanly stopped at the route handler.
 *
 * Soft-deleted agents (deleted_at IS NOT NULL) keep their chat surface
 * accessible — the transcript is the conversational record per
 * architecture §3 — but the message-input branches into a disabled
 * "deleted" state inside ChatInterface so new sends are not possible
 * until the agent is restored from /agents/trash.
 */
export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuthUser();
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: agent } = await supabase
    .from("agents")
    .select(
      "id, name, description, type, is_active, created_by, deleted_at",
    )
    .eq("id", id)
    .eq("is_active", true)
    .eq("type", "native")
    .maybeSingle();

  if (!agent) {
    notFound();
  }

  const isOwner = agent.created_by === user.id;
  const isDeleted = agent.deleted_at !== null;

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-0">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">{agent.name}</h1>
        {isOwner && !isDeleted ? (
          <Link
            href={`/agents/${agent.id}/edit`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Edit
          </Link>
        ) : null}
      </header>
      <ChatInterface
        agentId={agent.id}
        agentName={agent.name}
        agentDescription={agent.description}
        isDeleted={isDeleted}
      />
    </main>
  );
}
