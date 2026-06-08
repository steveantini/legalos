-- ============================================================================
-- demo-org.sql — stand up (and re-sync) the seeded Demo Org
-- ============================================================================
--
-- Demo access Step 1. Creates a single Demo Org and mirrors the real org's
-- STRUCTURE into it (departments + agents), so demo users (added in Step 2)
-- can be super_admin of a fully RLS-isolated, disposable sandbox that looks and
-- behaves like the real product without ever touching real data.
--
-- The Demo Org created here:
--   name  "Demo Workspace"
--   slug  "demo"
--   is_demo = true   <- the ONLY org with this flag; the reset cornerstone
--
-- SAFETY (this script is structurally one-directional):
--   * It RESOLVES the real org as the oldest org with is_demo = false and only
--     ever READS from it.
--   * It only ever WRITES (INSERT / ON CONFLICT UPDATE) to the Demo Org id.
--   * It asserts the Demo Org id differs from the real org id and that the real
--     org is not a demo before copying, and aborts (rolls back) otherwise.
--   So a re-run re-syncs the Demo Org's structure from the real org without
--   duplicating rows and without ever modifying the real org.
--
-- IDEMPOTENT: ON CONFLICT (slug) for the org, ON CONFLICT (organization_id,
-- slug) for departments and agents. Safe to re-run any time to re-mirror the
-- current real-org structure into the Demo Org.
--
-- PREREQUISITE: migration 0064 (organizations.is_demo) must be applied first.
--
-- DOES NOT create any users. Step 2 handles demo-user access (the /demo link)
-- and the reset script. Workflow TEMPLATES are intentionally not seeded here
-- (see the note at the end) — departments + agents are the structural mirror.
--
-- Run in the Supabase SQL Editor against your project. The RAISE NOTICE lines
-- print what was resolved/created/copied so you can verify inline.
-- ============================================================================

do $$
declare
  v_real_org_id    uuid;
  v_real_org_name  text;
  v_real_is_demo   boolean;
  v_demo_org_id    uuid;
  v_dept_count     integer;
  v_agent_count    integer;
begin
  -- --------------------------------------------------------------------------
  -- 1. Resolve the real org (oldest org that is NOT a demo). Read-only.
  -- --------------------------------------------------------------------------
  select id, name, is_demo
    into v_real_org_id, v_real_org_name, v_real_is_demo
    from public.organizations
   where is_demo = false
   order by created_at asc
   limit 1;

  if v_real_org_id is null then
    raise exception
      'No real (is_demo = false) organization found. Nothing to mirror.';
  end if;

  -- Paranoid: the source we mirror from must genuinely be a non-demo org.
  if v_real_is_demo is distinct from false then
    raise exception
      'Resolved source org % (%) is not is_demo = false; refusing to proceed.',
      v_real_org_name, v_real_org_id;
  end if;

  raise notice 'Real org (source, READ-ONLY): % (%)', v_real_org_name, v_real_org_id;

  -- --------------------------------------------------------------------------
  -- 2. Create / re-sync the Demo Org. The ONLY org with is_demo = true.
  -- --------------------------------------------------------------------------
  insert into public.organizations (name, slug, is_demo)
  values ('Demo Workspace', 'demo', true)
  on conflict (slug) do update set
    name = excluded.name,
    is_demo = true
  returning id into v_demo_org_id;

  -- Defensive: if ON CONFLICT didn't populate the variable, look it up.
  if v_demo_org_id is null then
    select id into v_demo_org_id from public.organizations where slug = 'demo';
  end if;

  -- Paranoid: never let the demo id collide with the real id. If it somehow
  -- did, every write below would hit the real org — abort instead.
  if v_demo_org_id is null then
    raise exception 'Failed to resolve the Demo Org id after upsert.';
  end if;
  if v_demo_org_id = v_real_org_id then
    raise exception
      'Demo Org id equals the real org id (%); refusing to write to the real org.',
      v_real_org_id;
  end if;

  raise notice 'Demo org (target, WRITE): Demo Workspace (%), is_demo = true', v_demo_org_id;

  -- --------------------------------------------------------------------------
  -- 3. Mirror DEPARTMENTS by SQL-copy (active only: deleted_at is null).
  --    Writes only to the Demo Org; reads only the real org.
  -- --------------------------------------------------------------------------
  insert into public.departments
    (organization_id, slug, name, description, sort_order, is_active)
  select
    v_demo_org_id, d.slug, d.name, d.description, d.sort_order, d.is_active
  from public.departments d
  where d.organization_id = v_real_org_id
    and d.deleted_at is null
  on conflict (organization_id, slug) do update set
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

  select count(*) into v_dept_count
    from public.departments
   where organization_id = v_demo_org_id and deleted_at is null;
  raise notice 'Departments in Demo Org: %', v_dept_count;

  -- --------------------------------------------------------------------------
  -- 4. Mirror AGENTS by SQL-copy (non-deleted only). Department is remapped by
  --    SLUG to the Demo Org's matching department. is_template and
  --    source_origin (C4L provenance) carry over. created_by and
  --    forked_from_agent_id are nulled so no row points at the real org's
  --    users/agents (a fork's lineage is not meaningful in the demo mirror).
  --    Agents whose real department was soft-deleted have no demo counterpart
  --    and are naturally excluded by the inner join (mirrors what a demo user
  --    would actually see).
  -- --------------------------------------------------------------------------
  insert into public.agents
    (organization_id, department_id, slug, name, description, type,
     external_url, system_prompt, model, sort_order, is_active, category,
     is_template, forked_from_agent_id, tools_enabled, default_output_format,
     source_origin, created_by)
  select
    v_demo_org_id, dd.id, a.slug, a.name, a.description, a.type,
    a.external_url, a.system_prompt, a.model, a.sort_order, a.is_active, a.category,
    a.is_template, null, a.tools_enabled, a.default_output_format,
    a.source_origin, null
  from public.agents a
  join public.departments rd
    on rd.id = a.department_id
   and rd.organization_id = v_real_org_id
  join public.departments dd
    on dd.slug = rd.slug
   and dd.organization_id = v_demo_org_id
   and dd.deleted_at is null
  where a.organization_id = v_real_org_id
    and a.deleted_at is null
  on conflict (organization_id, slug) do update set
    department_id = excluded.department_id,
    name = excluded.name,
    description = excluded.description,
    type = excluded.type,
    external_url = excluded.external_url,
    system_prompt = excluded.system_prompt,
    model = excluded.model,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    category = excluded.category,
    is_template = excluded.is_template,
    tools_enabled = excluded.tools_enabled,
    default_output_format = excluded.default_output_format,
    source_origin = excluded.source_origin;

  select count(*) into v_agent_count
    from public.agents
   where organization_id = v_demo_org_id and deleted_at is null;
  raise notice 'Agents in Demo Org: %', v_agent_count;

  raise notice 'Done. Demo Org mirror is in sync with the real org structure.';
end $$;


-- ============================================================================
-- Workflow templates — intentionally deferred to a quick follow-up.
-- ============================================================================
-- The status='template' workflow_definitions embed RESOLVED agent ids in their
-- `definition` jsonb (each agent step carries an `agentId`). Copying them to
-- the Demo Org means remapping every embedded agentId from the real agent to
-- the Demo Org's agent of the same slug. That remap is doable but fiddly, and
-- it cannot be verified against live data from here, so it is kept out of this
-- safety-critical foundation seed rather than shipped untested.
--
-- The clean follow-up (one tested command, no fiddly SQL): add an optional
-- `--org-id` flag to scripts/seed-workflow-templates.ts (it already resolves
-- template agents by SLUG per org, exactly the seam needed) and run it against
-- the Demo Org id. The Demo Org's agents share the real org's slugs, so every
-- template resolves. Until then the Demo Org's Template Library simply lists no
-- templates, which is harmless.
-- ============================================================================
-- Verification (run in the SQL Editor after seeding):
--
--   -- Exactly one Demo Org, flagged; the real org is not a demo.
--   select id, name, slug, is_demo from public.organizations order by created_at;
--   -- expect: real org is_demo = false; "Demo Workspace" (slug demo) is_demo = true
--
--   -- Demo Org departments mirror the real org's active set (same slugs/order).
--   select slug, name, sort_order from public.departments
--   where organization_id = (select id from public.organizations where slug = 'demo')
--     and deleted_at is null
--   order by sort_order;
--
--   -- Demo Org agent count matches the real org's non-deleted, visible agents.
--   select
--     (select count(*) from public.agents a
--        join public.departments d on d.id = a.department_id and d.deleted_at is null
--       where a.organization_id = (select id from public.organizations where slug = 'demo')
--         and a.deleted_at is null) as demo_agents,
--     (select count(*) from public.agents a
--        join public.departments d on d.id = a.department_id and d.deleted_at is null
--       where a.organization_id = (select id from public.organizations where slug != 'demo' order by 1 limit 1)
--         and a.deleted_at is null) as real_agents_visible;
-- ============================================================================
