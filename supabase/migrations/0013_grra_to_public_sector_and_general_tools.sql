-- ============================================================================
-- legalos
-- Migration 0013 — Merge GRRA into Public Sector; add General Tools
--                  (Session 9b)
-- ============================================================================
--
-- Aligns the departments table with the Aperture design's 8-department model
-- (Sessions 9a–9e). Final state: Commercial=1, Public Sector=2, M&A=3,
-- Privacy=4, Product=5, Compliance=6, Operations=7, General Tools=8.
--
-- One-shot prod backfill. Pre-flight verified GRRA contains exactly one
-- agent (the Blank Agent template seeded by 0004, slug 'blank-agent-grra').
-- Public Sector already has its own Blank Agent template, so GRRA's is
-- deleted rather than moved.
--
-- Hard-delete (vs soft-delete via departments.is_active = false) chosen
-- because app code does not filter on departments.is_active. Recorded in
-- D-029.
-- ============================================================================

begin;

-- 1. Public Sector description absorbs GRRA scope.
update public.departments
   set description = 'Government relations, regulatory affairs, public-sector contracts, and policy advocacy.'
 where slug = 'public-sector';

-- 2. Delete GRRA's only agent (the Blank Agent template). Public Sector
--    already has its own; moving would create two functionally identical
--    templates in the same department. Required before step 4 — the
--    `agents.department_id ... on delete restrict` FK would block a
--    department DELETE while any agent still pointed at GRRA.
delete from public.agents
 where department_id = (select id from public.departments where slug = 'grra');

-- 3. Delete user_department_roles rows for GRRA. The `on delete cascade`
--    on user_department_roles.department_id would also handle this when
--    step 4 runs; explicit DELETE for audit clarity.
delete from public.user_department_roles
 where department_id = (select id from public.departments where slug = 'grra');

-- 4. Hard-delete the GRRA department row.
delete from public.departments
 where slug = 'grra';

-- 5. Shift sort_order down by 1 for everything that was below GRRA.
--    Single UPDATE — sort_order has no UNIQUE constraint.
update public.departments
   set sort_order = sort_order - 1
 where slug in ('ma', 'privacy', 'product', 'compliance', 'operations');

-- 6. Insert General Tools at sort_order 8. Description is the
--    user-specified exact string (lowercase, no period — deliberate
--    divergence from the sentence-case + period convention used by
--    the other seven department descriptions; recorded in D-029).
insert into public.departments (organization_id, slug, name, description, sort_order)
select id, 'general-tools', 'General Tools', 'general purpose agentic tools', 8
  from public.organizations
  order by created_at asc
  limit 1
on conflict (organization_id, slug) do nothing;

-- 7. Grant existing org_admin / super_admin users dept_admin on
--    General Tools. Role-based generic clause — no hardcoded UUIDs,
--    future admins auto-grant. Same pattern as 0012. The org-scoped
--    join (d.organization_id = u.organization_id) matters for the
--    multi-tenant-ready schema: a user from org A must not be granted
--    dept_admin on org B's General Tools, even though today there is
--    only one organization.
insert into public.user_department_roles (user_id, department_id, role)
select u.id, d.id, 'dept_admin'
  from public.users u
  join public.departments d on d.organization_id = u.organization_id
 where u.role in ('org_admin', 'super_admin')
   and d.slug = 'general-tools'
on conflict (user_id, department_id) do nothing;

-- 8. Blank Agent template for General Tools. Column list, value shape,
--    system_prompt text, description text, model, and constants mirror
--    the canonical Blank Agent insert from 0004_blank_agents.sql /
--    0012_department_changes.sql. organization_id and department_id are
--    derived from the just-inserted general-tools row via SELECT.
insert into public.agents (
  organization_id, department_id, slug, name, description, type,
  system_prompt, model, sort_order, is_active, is_template,
  tools_enabled, default_output_format
)
select
  d.organization_id, d.id,
  'blank-agent-general-tools',
  'Blank Agent',
  'A blank starting point. Fork this template to build an agent from scratch.',
  'native',
  'You are a helpful assistant. Respond clearly and concisely to whatever the user asks. If you''re uncertain about the user''s intent, ask a clarifying question rather than guessing.',
  'anthropic/claude-sonnet-4-6',
  0,
  true,
  true,
  '[]'::jsonb,
  'markdown'
  from public.departments d
 where d.slug = 'general-tools'
on conflict (organization_id, slug) do nothing;

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back).
-- ============================================================================
--
-- begin;
--   delete from public.agents
--    where slug = 'blank-agent-general-tools' and is_template = true;
--
--   delete from public.user_department_roles
--    where department_id = (select id from public.departments where slug = 'general-tools');
--
--   delete from public.departments where slug = 'general-tools';
--
--   update public.departments set sort_order = 4 where slug = 'ma';
--   update public.departments set sort_order = 5 where slug = 'privacy';
--   update public.departments set sort_order = 6 where slug = 'product';
--   update public.departments set sort_order = 7 where slug = 'compliance';
--   update public.departments set sort_order = 8 where slug = 'operations';
--
--   insert into public.departments (organization_id, slug, name, description, sort_order)
--   select id, 'grra', 'Government Relations & Regulatory Affairs',
--          'Lobbying, regulatory monitoring, policy advocacy.', 3
--     from public.organizations
--     order by created_at asc
--     limit 1;
--
--   update public.departments
--      set description = 'Government contracts and public-sector matters.'
--    where slug = 'public-sector';
--
--   -- Rollback does NOT auto-restore the deleted blank-agent-grra
--   -- template. Recreate manually via the canonical Blank Agent shape
--   -- from supabase/seed/0004_blank_agents.sql, scoped to the recreated
--   -- GRRA row, if needed. Re-grant org_admins / super_admins on the
--   -- recreated GRRA via the same role-based pattern as step 7.
-- commit;
-- ============================================================================
