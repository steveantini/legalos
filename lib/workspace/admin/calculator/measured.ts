import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The MEASURED side of the hybrid calculator (productivity calculator Step A):
 * each active org agent with its real run count over the trailing 12 months,
 * read live from usage_events (one row ≈ one agent run, the same source the home
 * Impact and admin Insights aggregate). The editor maps a task type to an agent
 * to pull a measured volume; this provides both the agent list to map against and
 * each agent's count.
 *
 * Exact head counts per agent (the agent count per org is small — tens), so the
 * measured volumes are accurate rather than capped by PostgREST's default row
 * window. RLS scopes the reads to the caller's org (usage_events_admin_read +
 * agents_read_accessible); an explicit organization_id filter is defense in depth.
 * Tolerant of no profile / no agents → empty list.
 */

export interface AgentRun {
  id: string;
  name: string;
  runs: number;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function getOrgAgentsWithMeasuredRuns(): Promise<AgentRun[]> {
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return [];
  const orgId = profile.organization_id;

  const supabase = await createSupabaseServerClient();

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const list = agents ?? [];
  if (list.length === 0) return [];

  const sinceIso = new Date(Date.now() - YEAR_MS).toISOString();

  const counts = await Promise.all(
    list.map((agent) =>
      supabase
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("agent_id", agent.id)
        .gte("created_at", sinceIso),
    ),
  );

  return list.map((agent, i) => ({
    id: agent.id,
    name: agent.name,
    runs: counts[i].count ?? 0,
  }));
}
