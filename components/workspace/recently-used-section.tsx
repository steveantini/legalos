import { getAllDepartmentsWithAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CompactAgentCard } from "./compact-agent-card";

const RECENT_AGENT_LIMIT = 5;
// usage_events is one row per Anthropic call, so the same agent recurs
// many times in a row. Pull a margin of rows so dedupe + filtering still
// surfaces up to RECENT_AGENT_LIMIT distinct, currently-usable agents.
const USAGE_SCAN_LIMIT = 50;

type AgentEmbed = {
  id: string;
  name: string;
  deleted_at: string | null;
  is_active: boolean;
  department_id: string | null;
  departments: { id: string; name: string } | { id: string; name: string }[] | null;
};

type UsageRow = {
  agent_id: string;
  agents: AgentEmbed | AgentEmbed[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

/**
 * "Recently used" — up to 5 distinct agents the user has most recently
 * chatted with, sourced from the `usage_events` cost ledger (the only
 * per-account record of native-agent use; external-link agents never
 * appear because they are never chatted). Agents that have since been
 * deleted/deactivated, or whose department the user no longer has access
 * to, are filtered out so the row never offers a dead or forbidden link.
 */
export async function RecentlyUsedSection({ userId }: { userId: string }) {
  const supabase = await createSupabaseServerClient();

  // Departments the user can currently enter — used to drop agents whose
  // access was revoked since they were last used.
  const departments = await getAllDepartmentsWithAccess(userId);
  const accessibleDeptIds = new Set(
    departments.filter((d) => d.hasAccess).map((d) => d.id),
  );

  const { data } = await supabase
    .from("usage_events")
    .select(
      "agent_id, agents!inner(id, name, deleted_at, is_active, department_id, departments(id, name))",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(USAGE_SCAN_LIMIT);

  const rows = (data ?? []) as UsageRow[];

  const seen = new Set<string>();
  const agents: { id: string; name: string; departmentName: string }[] = [];
  for (const row of rows) {
    if (seen.has(row.agent_id)) continue;
    const agent = one(row.agents);
    if (!agent || agent.deleted_at !== null || !agent.is_active) continue;
    if (!agent.department_id || !accessibleDeptIds.has(agent.department_id)) {
      continue;
    }
    seen.add(row.agent_id);
    agents.push({
      id: agent.id,
      name: agent.name,
      departmentName: one(agent.departments)?.name ?? "",
    });
    if (agents.length >= RECENT_AGENT_LIMIT) break;
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[15px] font-medium tracking-[-0.005em] text-foreground">
        Recently used
      </h2>
      {agents.length === 0 ? (
        <p className="text-[14px] leading-[1.5] text-muted-foreground">
          Agents you chat with will show up here for quick access.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {agents.map((agent) => (
            <CompactAgentCard
              key={agent.id}
              id={agent.id}
              name={agent.name}
              departmentName={agent.departmentName}
            />
          ))}
        </div>
      )}
    </section>
  );
}
