import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side authorization helpers.
 *
 * RLS at the DB layer is the last-line enforcement. These helpers are the
 * application-layer complement — one call each for the common checks that
 * belong in server components and server actions. All are RLS-scoped (they
 * use the per-request Supabase client carrying the user's JWT); none use
 * the service role.
 */

/**
 * Returns the current Supabase auth user, or redirects to /login if no
 * session exists. The proxy (`proxy.ts`) already gates protected routes;
 * calling this at the top of a server component is defense in depth.
 *
 * Wrapped in React's `cache()` so multiple call sites within the same
 * request (e.g., a layout + its child page) resolve to the same auth
 * lookup. Per-request memoization only — does not leak across requests.
 */
export const requireAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});

/**
 * Returns the `public.users` profile for the current auth user, or null
 * if the user is unauthenticated or not yet provisioned (proxy race,
 * or the organization row doesn't exist yet).
 *
 * Wrapped in React's `cache()` for per-request memoization (see
 * `requireAuthUser` above).
 */
export const getCurrentUserProfile = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  const { data } = await supabase
    .from("users")
    .select(
      "id, email, full_name, role, organization_id, is_active, welcomed_at",
    )
    .eq("id", authUser.id)
    .maybeSingle();

  return data;
});

/**
 * Subset of `public.departments` columns the launchpad UI needs.
 */
export interface AccessibleDepartment {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

/**
 * Returns the departments the current user has at least one role in,
 * ordered by `sort_order` ascending. Used by the picker page at `/` and
 * the department tab bar on `/departments/[slug]` so both surfaces show
 * the same accessible-departments list.
 *
 * The query joins `user_department_roles` with `departments` via an
 * INNER PostgREST join — same predicate `has_department_access` checks
 * per row, applied across all departments at once. RLS still scopes
 * `departments` reads to the user's organization so cross-org leakage
 * is impossible even if `user_department_roles` were corrupted.
 *
 * Wrapped in React's `cache()` for per-request memoization keyed by
 * `userId` — layout + child page calling this with the same userId
 * resolve to a single PostgREST round-trip.
 */
export const getAccessibleDepartments = cache(
  async (userId: string): Promise<AccessibleDepartment[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("user_department_roles")
      .select(
        "departments!inner(id, slug, name, description, sort_order)",
      )
      .eq("user_id", userId);

    const departments = (data ?? [])
      .map(
        (row) =>
          (row as unknown as { departments: AccessibleDepartment }).departments,
      )
      .filter((d): d is AccessibleDepartment => Boolean(d));

    departments.sort((a, b) => a.sort_order - b.sort_order);
    return departments;
  },
);

/**
 * Returns active, non-deleted agent counts per department, keyed by
 * department UUID. RLS scopes the underlying `agents` read to rows the
 * current user can see; `is_active = true` and `deleted_at IS NULL`
 * layer on top of RLS so soft-deleted and deactivated agents don't
 * inflate the count.
 *
 * Used by the Workspace landing (Session 9e) to render "{N} agents"
 * in each department card's foot. Templates and user-owned agents both
 * count — the foot shows total available.
 *
 * One round-trip: returns ~50–100 department_id rows for the current
 * setup (8 departments × ~1–8 agents each), aggregated in JS.
 */
export async function getAgentCountsByDepartment(): Promise<
  Record<string, number>
> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("agents")
    .select("department_id")
    .eq("is_active", true)
    .is("deleted_at", null);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.department_id] = (counts[row.department_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Unified agent shape returned by `getAgent`. Carries every column the
 * chat surface, edit form, and breadcrumb collectively need — the chat
 * page narrows further via its `notFound()` clause (`type='native' &&
 * is_active`); the edit page narrows further (owner + non-template +
 * non-deleted + has-prompt-and-model). The helper itself stays general
 * with a single null contract on any failure mode (missing, RLS-hidden).
 */
export type AccessibleAgent = {
  id: string;
  name: string;
  description: string | null;
  type: "external" | "native";
  is_active: boolean;
  is_template: boolean;
  system_prompt: string | null;
  model: string | null;
  tools_enabled: unknown;
  created_by: string | null;
  deleted_at: string | null;
  /**
   * Last-modified timestamp from the agents table. Surfaced in the chat
   * empty-state facts row (Session 19, spec §2.8) as "Last updated".
   * The `agents_updated_at` trigger from migration 0001 keeps this
   * current on every UPDATE.
   */
  updated_at: string;
  department: { slug: string; name: string } | null;
};

/**
 * Returns the agent row for `id` IF the current user can read it (RLS
 * scoped via `agents_read_accessible`), else null. Includes the nested
 * department slug + name for breadcrumb resolution.
 *
 * Single null contract covers all failure modes (missing, RLS-hidden,
 * etc.) — same idiom as `getDepartmentIfAccessible`. Callers narrow
 * further with their own `notFound()` clauses for type/owner/deleted
 * refinement.
 *
 * Wrapped in React's `cache()` for per-request memoization keyed by
 * `id` — agent layout + breadcrumb + rail-active-state + page can all
 * call this with the same id and resolve to a single Supabase
 * round-trip.
 */
export const getAgent = cache(
  async (id: string): Promise<AccessibleAgent | null> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("agents")
      .select(
        "id, name, description, type, is_active, is_template, system_prompt, model, tools_enabled, created_by, deleted_at, updated_at, departments!inner(slug, name)",
      )
      .eq("id", id)
      .maybeSingle();

    if (!data) return null;

    const dept =
      (data.departments as unknown as { slug: string; name: string } | null) ??
      null;

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      type: data.type,
      is_active: data.is_active,
      is_template: data.is_template,
      system_prompt: data.system_prompt,
      model: data.model,
      tools_enabled: data.tools_enabled,
      created_by: data.created_by,
      deleted_at: data.deleted_at,
      updated_at: data.updated_at,
      department: dept,
    };
  },
);

/**
 * Slim per-agent context the workspace chrome (breadcrumb + rail
 * active-state) needs to resolve `<id>` paths to human-readable names
 * and parent department slugs.
 */
export interface AgentBreadcrumbContext {
  id: string;
  name: string;
  department_slug: string;
  department_name: string;
}

/**
 * Returns every agent the current user can read, projected to the slim
 * `AgentBreadcrumbContext` shape. Active, non-deleted only — soft-
 * deleted agents keep their chat surface (architecture §3) but are
 * intentionally NOT in the rail's active-resolution list since they
 * don't appear in the launchpad either; navigating to a soft-deleted
 * agent's chat URL falls through to the breadcrumb's defensive "Agent"
 * fallback rather than highlighting a parent department.
 *
 * The slim shape is deliberate — the workspace layout fetches this on
 * every render to feed the breadcrumb + rail; full agent rows would
 * be wasteful for what's essentially a `(id, name, dept)` lookup table.
 *
 * Wrapped in `cache()` keyed by `userId` for per-request dedup with
 * any other caller (none today, but matches the 10a posture).
 */
export const getAccessibleAgentsForBreadcrumb = cache(
  async (userId: string): Promise<AgentBreadcrumbContext[]> => {
    // RLS handles row-level scoping; userId is included in the cache
    // key so different user contexts don't share a cached promise.
    void userId;

    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("agents")
      .select("id, name, departments!inner(slug, name)")
      .eq("is_active", true)
      .is("deleted_at", null);

    if (!data) return [];

    return data
      .map((row) => {
        const dept = row.departments as unknown as {
          slug: string;
          name: string;
        } | null;
        if (!dept) return null;
        return {
          id: row.id as string,
          name: row.name as string,
          department_slug: dept.slug,
          department_name: dept.name,
        };
      })
      .filter((a): a is AgentBreadcrumbContext => Boolean(a));
  },
);

/**
 * Returns the department row for `slug` IF the current user has any role
 * in that department, else null.
 *
 * A single null return covers both "slug doesn't exist" and "user has no
 * access to this department". Callers get one branch and cannot leak
 * department existence through differentiated error handling.
 */
export async function getDepartmentIfAccessible(slug: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: department } = await supabase
    .from("departments")
    .select("id, slug, name, description")
    .eq("slug", slug)
    .maybeSingle();

  if (!department) {
    return null;
  }

  const { data: access } = await supabase
    .from("user_department_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("department_id", department.id)
    .maybeSingle();

  if (!access) {
    return null;
  }

  return department;
}

/**
 * Returns true if the current user has an org-level admin role
 * (`super_admin` / `org_admin`) OR is `dept_admin` for at least one
 * department. Used by the workspace layout to conditionally render
 * the Admin item in the rail's profile dropdown, and by
 * `requireAdminUser()` to gate admin routes — both paths run on
 * `/admin` requests, which the `cache()` wrap dedupes to a single
 * pair of Supabase reads per request.
 *
 * Two DB reads (org role, then dept_admin existence) — acceptable at
 * Phase 1 scale. Collapse into a single query in a later phase if
 * this shows up on a page-load flame graph.
 */
export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profile &&
    (profile.role === "super_admin" || profile.role === "org_admin")
  ) {
    return true;
  }

  const { data: deptAdmin } = await supabase
    .from("user_department_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "dept_admin")
    .limit(1)
    .maybeSingle();

  return Boolean(deptAdmin);
});

/**
 * Gate for admin routes. Redirects unauthenticated users to /login via
 * `requireAuthUser()`; for authenticated-but-not-admin users, calls
 * `notFound()` rather than redirecting — the 404 avoids leaking the
 * existence of the admin section to non-admin accounts.
 */
export async function requireAdminUser() {
  const user = await requireAuthUser();
  const admin = await isCurrentUserAdmin();
  if (!admin) {
    notFound();
  }
  return user;
}

/**
 * Subset of `public.agents` columns the launchpad needs. RLS still scopes
 * results to the current user's organization and the departments they have
 * access to. Exported so callers can import the shape alongside the helper.
 */
export interface LaunchpadAgent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: "external" | "native";
  external_url: string | null;
  category: string | null;
  sort_order: number;
}

/**
 * Two-bucket department agent loader for the Aperture launchpad:
 *
 *   - departmentAgents — canonical native agents owned by the department
 *     itself (`is_template = false AND created_by IS NULL`). Pattern B
 *     from Session 21 — system-seeded, click-to-chat-directly.
 *   - myAgents        — user-owned native agents (`is_template = false
 *     AND created_by = userId`). Click routes to the chat surface.
 *
 * Templates were retired in Session 21 — the launchpad's Templates
 * section was dropped in favor of a "+ New Agent" button in the page
 * header. The Blank Agent rows were archived (is_active=false) by
 * migration 0017 alongside that change. If template-based forking
 * returns in a future session, restore the third bucket here +
 * matching section + matching `is_template = true` page query.
 *
 * Two queries instead of one because the predicates are different
 * shapes and Postgres uses different indexes (`agents_is_template_idx`
 * vs the partial `agents_active_idx` from migration 0006). Cleaner and
 * faster than partitioning a flat result in JS.
 *
 * The `departmentAgents` and `myAgents` predicates both filter on
 * `is_template = false` but disjoin via `created_by IS NULL` vs
 * `created_by = userId` — so a user's fork of an agent that happens to
 * have a NULL created_by would not collide; in practice all forks
 * carry `created_by = userId` (the create action populates it), so the
 * two buckets are cleanly disjoint.
 *
 * Both queries are RLS-scoped — `agents_read_accessible` requires
 * `has_department_access(department_id)` for SELECT, so an unauthorized
 * user gets an empty result without an error.
 *
 * Sort orders:
 *   - departmentAgents: `sort_order asc` (curated order from the seed)
 *   - myAgents:         `created_at desc` (most recently created first)
 *
 * Not wrapped in `cache()` — only one caller per request (the launchpad
 * page itself). If a future surface (e.g., a launchpad-loading skeleton
 * that fetches the same data) emerges, wrap it then.
 */
export async function getAgentsForDepartmentLaunchpad(
  departmentId: string,
  userId: string,
): Promise<{
  departmentAgents: LaunchpadAgent[];
  myAgents: LaunchpadAgent[];
}> {
  const supabase = await createSupabaseServerClient();

  const [departmentAgentsResult, myAgentsResult] = await Promise.all([
    supabase
      .from("agents")
      .select(
        "id, slug, name, description, type, external_url, category, sort_order",
      )
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .eq("is_template", false)
      .is("created_by", null)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("agents")
      .select(
        "id, slug, name, description, type, external_url, category, sort_order",
      )
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .eq("is_template", false)
      .eq("created_by", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  return {
    departmentAgents: (departmentAgentsResult.data ?? []) as LaunchpadAgent[],
    myAgents: (myAgentsResult.data ?? []) as LaunchpadAgent[],
  };
}

/**
 * Subset of `public.agents` the trash page needs. Includes the deletion
 * timestamp (for the "deleted X ago" relative display) and a join to the
 * department for context.
 */
export interface DeletedAgent {
  id: string;
  name: string;
  description: string | null;
  deleted_at: string;
  department: { slug: string; name: string } | null;
}

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns the user's soft-deleted agents within the 30-day undo window,
 * ordered by deletion time descending (most recently deleted first).
 *
 * The 30-day cutoff is computed in the application layer and passed to
 * Postgres as an ISO timestamp. Slight clock skew between Next and
 * Postgres is tolerable at single-user scale; if it ever matters, lift
 * the cutoff into a SQL `now() - interval '30 days'` predicate.
 *
 * RLS scopes via the existing agents_read_accessible policy: a user can
 * only read agents in their org and accessible departments. The explicit
 * `created_by = userId` filter narrows further to ownership.
 */
export async function getDeletedAgentsForUser(
  userId: string,
): Promise<DeletedAgent[]> {
  const supabase = await createSupabaseServerClient();
  const cutoff = new Date(Date.now() - RESTORE_WINDOW_MS).toISOString();

  const { data } = await supabase
    .from("agents")
    .select(
      "id, name, description, deleted_at, departments(slug, name)",
    )
    .eq("created_by", userId)
    .eq("is_template", false)
    .not("deleted_at", "is", null)
    .gt("deleted_at", cutoff)
    .order("deleted_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    deleted_at: row.deleted_at as string,
    department: row.departments as unknown as
      | { slug: string; name: string }
      | null,
  }));
}

/**
 * One conversation message hydrated for the chat surface on reload, with
 * the Session 18 sources and tool_calls JSONB columns selected so the
 * chat surface can reconstruct the same block list (text + trace cards
 * + sources list) it would have built from streamed events.
 *
 * `content` carries inline `<sup data-source-id="..." />` markers; the
 * markdown renderer + sanitize schema let those through to a
 * <CitationMarker /> override. Tool calls' `position` field is the
 * splice offset into `content` where each trace card slots in.
 */
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: unknown;
  tool_calls: unknown;
}

/**
 * Loads a conversation by id WITH its full message list, but only if the
 * conversation belongs to the current user and to the given agent. The
 * agent_id check guards against `?c=<id>` pointing at another agent's
 * conversation — the chat surface assumes its messages belong to the
 * agent in the URL path.
 *
 * Returns null on any of: missing, foreign-user, foreign-agent. Single
 * null contract so callers can fall through to "fresh conversation"
 * without leaking which check failed. RLS would already block foreign
 * reads at the DB layer; the explicit owner+agent check is belt-and-
 * suspenders and lets us return null cleanly rather than receiving an
 * empty PostgREST result.
 */
export async function getConversationForChatSurface(
  conversationId: string,
  agentId: string,
  userId: string,
): Promise<{
  id: string;
  messages: ConversationMessage[];
} | null> {
  const supabase = await createSupabaseServerClient();

  const { data: convo } = await supabase
    .from("conversations")
    .select("id, user_id, agent_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!convo || convo.user_id !== userId || convo.agent_id !== agentId) {
    return null;
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, sources, tool_calls")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return {
    id: convo.id,
    messages: (messages ?? []) as ConversationMessage[],
  };
}
