import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAgent } from "@/lib/auth/access";

/**
 * Layout for the agent surfaces (`/agents/<id>` chat + `/agents/<id>/edit`).
 * Lives under the `(workspace)` route group so both inherit the rail +
 * top bar from `(workspace)/layout.tsx`.
 *
 * The layout owns the agent fetch + the existence-leak gate: a single
 * `notFound()` covers missing, RLS-hidden, and any other unreadable
 * state. Child pages (chat + edit) re-call `getAgent(id)` for their own
 * narrower checks (type, owner, deleted, etc.); React's `cache()` wrap
 * means all calls within a request resolve to a single Supabase
 * round-trip.
 *
 * `generateMetadata` provides the default document title (`<Agent.name>`).
 * Child pages can override with their own `generateMetadata` (e.g., the
 * edit page uses "Edit <Agent.name>").
 *
 * Note: this layout exists in the filesystem before the page files
 * arrive (per the 10c phased plan). With no `page.tsx` underneath, the
 * URL `/agents/<id>` continues to resolve to the legacy
 * `(app)/agents/[id]/page.tsx`. Once the pages move, this layout
 * activates automatically.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const agent = await getAgent(id);
  return { title: agent?.name ?? "Agent" };
}

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  if (!agent) {
    notFound();
  }

  return <>{children}</>;
}
