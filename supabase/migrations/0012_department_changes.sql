-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0012 — Department reorder + 3 new departments + Blank Agents
--                   (Session 8l)
-- ============================================================================
--
-- Backfills prod state for the expanded department list. Splits into five
-- idempotent sections inside a single do-block:
--
--   1. Reorder + canonicalize names on the existing 5 departments
--      (Commercial=1, Public Sector=2, GR&RA=3, M&A=4, Privacy=5).
--      Names set to canonical long forms regardless of current state —
--      prod had abbreviated forms ("M&A", "GR&RA") that this migration
--      flips to "Mergers & Acquisitions" / "Government Relations &
--      Regulatory Affairs".
--   2. Insert 3 new departments: Product (6), Compliance (7),
--      Operations (8).
--   3. Grant existing org_admin / super_admin users dept_admin on the
--      new 3 departments. Generic by role (not hardcoded UUID) so
--      future admin users auto-pick-up access on similar migrations.
--   4. Insert Blank Agent templates for the 3 new departments,
--      mirroring the 0004_blank_agents.sql shape.
--
-- Skipped on a fresh fork (no organization seeded yet) — the updated
-- supabase/seed/0001_org_and_departments.sql and
-- supabase/seed/0004_blank_agents.sql together cover the canonical
-- state for new deployments. This migration is a prod-only backfill.
--
-- Idempotence: every section uses ON CONFLICT DO NOTHING (inserts) or
-- direct UPDATE-to-canonical-values (updates are no-ops when the row
-- already matches). Re-runnable.
-- ============================================================================

do $$
declare
  v_org_id            uuid;
  v_blank_prompt      text :=
    'You are a helpful assistant. Respond clearly and concisely to whatever '
    'the user asks. If you''re uncertain about the user''s intent, ask a '
    'clarifying question rather than guessing.';
  v_blank_description text :=
    'A blank starting point. Fork this template to build an agent from scratch.';
  v_dept              record;
begin
  select id into v_org_id
    from public.organizations
    order by created_at asc
    limit 1;

  if v_org_id is null then
    -- Fresh fork: organization not yet seeded. Seed 0001 covers the
    -- canonical state for all 8 departments; seed 0004 creates the
    -- Blank Agent templates by looping over every department. Nothing
    -- for this migration to do.
    return;
  end if;

  -- ----------------------------------------------------------------------
  -- 1. Reorder + canonicalize names on existing 5 departments.
  -- ----------------------------------------------------------------------

  update public.departments
     set name = 'Commercial', sort_order = 1
   where organization_id = v_org_id and slug = 'commercial';

  update public.departments
     set name = 'Public Sector', sort_order = 2
   where organization_id = v_org_id and slug = 'public-sector';

  update public.departments
     set name = 'Government Relations & Regulatory Affairs', sort_order = 3
   where organization_id = v_org_id and slug = 'grra';

  update public.departments
     set name = 'Mergers & Acquisitions', sort_order = 4
   where organization_id = v_org_id and slug = 'ma';

  update public.departments
     set name = 'Privacy', sort_order = 5
   where organization_id = v_org_id and slug = 'privacy';

  -- ----------------------------------------------------------------------
  -- 2. Insert 3 new departments.
  -- ----------------------------------------------------------------------

  insert into public.departments (organization_id, slug, name, description, sort_order)
  values
    (v_org_id, 'product', 'Product',
     'Product launches, feature reviews, terms updates, and product-counsel partnerships.',
     6),
    (v_org_id, 'compliance', 'Compliance',
     'Compliance program management, regulatory monitoring, and audit support.',
     7),
    (v_org_id, 'operations', 'Operations',
     'Internal operations, vendor management, procurement, and corporate transactions.',
     8)
  on conflict (organization_id, slug) do nothing;

  -- ----------------------------------------------------------------------
  -- 3. Grant org_admin / super_admin users dept_admin on the new 3.
  --    Role-based generic grant — no hardcoded user UUID. In prod
  --    today that's the project owner; future admin users auto-grant.
  -- ----------------------------------------------------------------------

  insert into public.user_department_roles (user_id, department_id, role)
  select u.id, d.id, 'dept_admin'
    from public.users u
    cross join public.departments d
   where u.organization_id = v_org_id
     and d.organization_id = v_org_id
     and u.role in ('org_admin', 'super_admin')
     and d.slug in ('product', 'compliance', 'operations')
  on conflict (user_id, department_id) do nothing;

  -- ----------------------------------------------------------------------
  -- 4. Blank Agent templates for the new 3 departments. Same shape as
  --    0004_blank_agents.sql, scoped to the new slugs only — existing
  --    Blank Agents on the original 5 departments aren't touched.
  -- ----------------------------------------------------------------------

  for v_dept in
    select id, slug
      from public.departments
     where organization_id = v_org_id
       and slug in ('product', 'compliance', 'operations')
  loop
    insert into public.agents (
      organization_id, department_id, slug, name, description, type,
      system_prompt, model, sort_order, is_active, is_template,
      tools_enabled, default_output_format
    )
    values (
      v_org_id, v_dept.id,
      'blank-agent-' || v_dept.slug,
      'Blank Agent',
      v_blank_description,
      'native',
      v_blank_prompt,
      'anthropic/claude-sonnet-4-6',
      0,
      true,
      true,
      '[]'::jsonb,
      'markdown'
    )
    on conflict (organization_id, slug) do nothing;
  end loop;
end $$;

-- ============================================================================
-- Reverse (do not run unless rolling back).
-- ============================================================================
--
-- begin;
--   -- Drop the 3 new Blank Agents. Adjust slugs if you want to preserve
--   -- any user-customized variants.
--   delete from public.agents
--    where slug in (
--      'blank-agent-product', 'blank-agent-compliance', 'blank-agent-operations'
--    )
--      and is_template = true;
--
--   -- Drop the user_department_roles for the 3 new departments.
--   delete from public.user_department_roles
--    where department_id in (
--      select id from public.departments
--       where slug in ('product', 'compliance', 'operations')
--    );
--
--   -- Drop the 3 new departments.
--   delete from public.departments
--    where slug in ('product', 'compliance', 'operations');
--
--   -- Restore the prior sort_order. Names are not reverted (the long
--   -- forms are the canonical ones; abbreviations were the drift).
--   update public.departments set sort_order = 2 where slug = 'ma';
--   update public.departments set sort_order = 3 where slug = 'public-sector';
--   update public.departments set sort_order = 4 where slug = 'grra';
-- commit;
-- ============================================================================
