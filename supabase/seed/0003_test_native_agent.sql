-- ============================================================================
-- 0003_test_native_agent.sql — Minimal test native agent for Session 8a
-- ============================================================================
--
-- Seeds a single native-type agent the /api/chat smoke test can call.
-- Without this row there is no way to exercise the runtime end-to-end
-- before Session 8c promotes one of the six existing Commercial external
-- agents to native — see DECISION_LOG D-023 for the scope rationale.
--
-- The model id (anthropic/claude-sonnet-4-6) is chosen for cost during
-- smoke testing; the runtime supports any model in lib/anthropic/pricing.ts.
-- The 'anthropic/' prefix is the vendor-namespaced format introduced in
-- migration 0005; older rows are migrated by 0005's UPDATE statements.
--
-- Idempotent: ON CONFLICT (organization_id, slug) DO UPDATE. Safe to
-- re-run. Replaced (or removed) in Session 8c.
--
-- Prereqs:
--   - supabase/seed/0001_org_and_departments.sql has been run
--     (organization + Commercial department exist).
--   - supabase/migrations/0003_agents_category.sql has been applied
--     (agents.category column exists; this seed sets it to NULL,
--     matching the "uncategorized native agent" pattern).
--   - supabase/migrations/0004_native_agents.sql has been applied
--     (the runtime tables exist; not strictly required to insert this
--     row, but the smoke test against this agent will fail without it).
--   - supabase/migrations/0006_agents_extensions.sql has been applied
--     (agents.is_template column exists). The Test Smoke Agent is
--     seeded with is_template = false explicitly — same as the column
--     default, but stated for clarity so a fresh fork is unambiguous.
-- ============================================================================

do $$
declare
  v_org_id  uuid;
  v_dept_id uuid;
begin
  select id into v_org_id
    from public.organizations
    order by created_at asc
    limit 1;

  if v_org_id is null then
    raise exception
      'No organization found. Run supabase/seed/0001_org_and_departments.sql first.';
  end if;

  select id into v_dept_id
    from public.departments
    where organization_id = v_org_id and slug = 'commercial'
    limit 1;

  if v_dept_id is null then
    raise exception
      'Commercial department not found. Run supabase/seed/0001_org_and_departments.sql first.';
  end if;

  insert into public.agents (
    organization_id, department_id, slug, name, description, type,
    system_prompt, model, sort_order, is_active, is_template
  )
  values (
    v_org_id, v_dept_id,
    'test-smoke-agent',
    'Test Smoke Agent',
    'Minimal native agent used by the Session 8a /api/chat smoke test. Replaced in Session 8c by promoting an existing Commercial agent to native.',
    'native',
    'You are a helpful test assistant for the legal department launchpad smoke test. Answer briefly and clearly. You are not a substitute for legal advice.',
    'anthropic/claude-sonnet-4-6',
    999,
    true,
    false
  )
  on conflict (organization_id, slug) do update set
    department_id = excluded.department_id,
    name          = excluded.name,
    description   = excluded.description,
    type          = excluded.type,
    system_prompt = excluded.system_prompt,
    model         = excluded.model,
    sort_order    = excluded.sort_order,
    is_active     = excluded.is_active,
    is_template   = excluded.is_template;
end $$;
