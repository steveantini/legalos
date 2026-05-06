-- ============================================================================
-- 0004_blank_agents.sql — Blank Agent template seeded into every department
--                          (archived as of Session 21)
-- ============================================================================
--
-- Creates a "Blank Agent" template row in each of the eight starting
-- departments (Commercial, Public Sector, M&A, Privacy, Product,
-- Compliance, Operations, General Tools). Pre-Session-21 these were
-- active rows (`is_active = true`) surfaced in the department
-- launchpad's Templates section as the "start from scratch" option.
--
-- Session 21 dropped the Templates section in favor of a "+ New Agent"
-- button in the page header (routes to `/agents/new?department=<slug>`).
-- The Blank Agent rows lost their UI surface; migration 0017 archived
-- the existing prod rows (`is_active = false`) and this seed file was
-- updated in the same commit so a fresh dev re-seed reproduces the
-- archived shape rather than rolling it back to the pre-Session-21
-- active state. The rows are kept (not deleted) to preserve foreign-key
-- targets in any user-fork lineage that came through the old Templates
-- → fork flow.
--
-- Each department gets its own row because the agents table's unique
-- constraint is (organization_id, slug); to allow a Blank Agent on every
-- department page without clashing slugs, the slug is suffixed with the
-- department slug (blank-agent-commercial, blank-agent-ma, etc). Display
-- name stays "Blank Agent".
--
-- The 'agents_native_requires_prompt' check constraint in 0001 requires
-- system_prompt and model to be non-null on native agents, so the row
-- still ships with a minimal default system prompt. (The constraint
-- doesn't condition on `is_active`, so even archived rows must satisfy
-- it.) The prompt intentionally does NOT reference the "edit-this-prompt"
-- UX so it does not leak the configuration architecture to the model.
--
-- Idempotent: ON CONFLICT (organization_id, slug) DO UPDATE — the SET
-- clause asserts `is_active = false` so re-seeding never re-activates
-- the rows.
--
-- Prereqs:
--   - supabase/seed/0001_org_and_departments.sql has been run
--     (organization + the five departments exist).
--   - supabase/migrations/0006_agents_extensions.sql has been applied
--     (is_template, default_output_format, tools_enabled columns exist).
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
    raise exception
      'No organization found. Run supabase/seed/0001_org_and_departments.sql first.';
  end if;

  for v_dept in
    select id, slug
      from public.departments
     where organization_id = v_org_id
     order by sort_order asc
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
      false,            -- is_active = false (archived per Session 21 / migration 0017)
      true,             -- is_template = true (kept for forensic / lineage purposes)
      '[]'::jsonb,
      'markdown'
    )
    on conflict (organization_id, slug) do update set
      department_id          = excluded.department_id,
      name                   = excluded.name,
      description            = excluded.description,
      type                   = excluded.type,
      system_prompt          = excluded.system_prompt,
      model                  = excluded.model,
      sort_order             = excluded.sort_order,
      is_active              = excluded.is_active,
      is_template            = excluded.is_template,
      tools_enabled          = excluded.tools_enabled,
      default_output_format  = excluded.default_output_format;
  end loop;
end $$;
