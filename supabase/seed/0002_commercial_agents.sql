-- ============================================================================
-- 0002_commercial_agents.sql — Commercial department agent seed
-- ============================================================================
--
-- Seeds six canonical departmental agents into the Commercial department
-- (Pattern B — Session 21):
--   sell-side: Enterprise Agreement Review, Mutual NDA Review,
--              Order Form & SOW Review
--   buy-side:  Vendor Agreement Review, DPA Review, AI Addendum Review
--
-- All six are `type='native'` with placeholder system prompts and the
-- default Sonnet 4.6 model. They are NOT templates (`is_template=false`)
-- — they're canonical departmental agents that surface in the launchpad's
-- "Approved agents" section (titled "Department Agents" when this seed
-- was written) and route directly to the chat surface
-- on click, NOT scaffolding for users to fork. Personal AI Workflow
-- Builder (the click-to-fork-and-customize flow) remains a Phase 3
-- roadmap item; these six exist independently of that future feature.
--
-- The placeholder prompts here MIRROR the prompt content in
-- `supabase/migrations/0016_commercial_agents_to_native.sql` — keep
-- them in sync if either is edited; the migration is the authoritative
-- source for prompt content while these placeholders stand in for real
-- prompt authoring.
--
-- Historical note: pre-Session-21 these were `type='external'` /
-- `is_template=true` rows pointing at `https://gemini.google.com/gem/
-- placeholder-<slug>` URLs (clicking opened Gemini in a new tab rather
-- than the in-app surface). Migration 0016 flipped them to native +
-- non-template; this seed was updated in the same commit so a fresh
-- re-seed reproduces the post-migration state rather than rolling it
-- back. The launchpad query (`getAgentsForDepartmentLaunchpad` in
-- `lib/auth/access.ts`) gained a third bucket — `departmentAgents`,
-- predicated on `is_template=false AND created_by IS NULL` — so these
-- system-seeded canonical agents surface in their own section without
-- colliding with user-owned forks (My Agents, predicated on
-- `created_by = userId`).
--
-- The placeholder prompts give each agent a recognizable persona but
-- are not final content. Real prompt authoring — playbook clauses,
-- jurisdictional defaults, customer scenarios — happens in a future
-- content session. Until then, an org_admin / dept_admin can refine
-- each prompt through the agent edit UI; re-running this seed will
-- OVERWRITE those edits (the ON CONFLICT DO UPDATE clause is
-- destructive by design, asserting this seed as the canonical row
-- shape for these six slugs).
--
-- Idempotent: ON CONFLICT (organization_id, slug) DO UPDATE. Safe to
-- re-run.
--
-- Prereqs:
--   1. supabase/seed/0001_org_and_departments.sql has been run
--      (organization + Commercial department exist).
--   2. supabase/migrations/0003_agents_category.sql has been applied
--      (agents table has a `category` column).
--   3. supabase/migrations/0006_agents_extensions.sql has been applied
--      (agents table has an `is_template` column and `tools_enabled`
--      defaulting to '[]'). The six rows below are seeded with
--      is_template = false (canonical departmental agents per Pattern B,
--      Session 21). Pre-Session-21 these were seeded with
--      is_template = true; migration 0016 flipped existing prod rows
--      and this seed file's INSERT body matches that post-migration
--      shape so re-seeds reproduce it.
--   4. supabase/migrations/0005_vendor_prefixed_model_ids.sql has been
--      applied (the `anthropic/` prefix on the model id is the
--      vendor-namespaced form 0005 introduced).
-- ============================================================================

do $$
declare
  v_org_id uuid;
  v_dept_id uuid;
begin
  -- Resolve the single-tenant organization and the Commercial department.
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
    system_prompt, model, external_url, category, sort_order, is_active, is_template
  )
  values
    (v_org_id, v_dept_id, 'enterprise-agreement-review',
     'Enterprise Agreement Review',
     'Reviews enterprise customer agreements — issue-spotting, redline analysis, and clause comparison against a standard playbook.',
     'native',
     'You are an enterprise agreement review specialist. Help the user review enterprise sales contracts, identify standard and non-standard terms, flag negotiation points, and suggest redlines. Focus on commercial reasonableness and legal risk.',
     'anthropic/claude-sonnet-4-6',
     null,
     'sell-side', 1, true, false),
    (v_org_id, v_dept_id, 'mutual-nda-review',
     'Mutual NDA Review',
     'Reviews mutual non-disclosure agreements, flags non-standard clauses (term, jurisdiction, residuals), and suggests fallback language.',
     'native',
     'You are a mutual NDA review specialist. Help the user review mutual non-disclosure agreements, identify terms that deviate from market standard, flag overly broad confidentiality obligations, and suggest balanced edits. Focus on reciprocity and clear definitions.',
     'anthropic/claude-sonnet-4-6',
     null,
     'sell-side', 2, true, false),
    (v_org_id, v_dept_id, 'order-form-sow-review',
     'Order Form & SOW Review',
     'Reviews order forms and statements of work for consistency with the master agreement and standard commercial terms.',
     'native',
     'You are an order form and statement of work review specialist. Help the user review order forms and SOWs for commercial sales transactions, verify alignment with the master agreement, identify pricing or scope ambiguity, and flag terms that conflict with standard playbook positions.',
     'anthropic/claude-sonnet-4-6',
     null,
     'sell-side', 3, true, false),
    (v_org_id, v_dept_id, 'vendor-agreement-review',
     'Vendor Agreement Review',
     'Reviews inbound vendor and SaaS agreements — liability, indemnity, IP, termination, and renewal triggers.',
     'native',
     'You are a vendor agreement review specialist representing the buy-side. Help the user review vendor and supplier contracts, identify risk-shifting provisions, flag unfavorable indemnification or limitation of liability terms, and suggest negotiation positions that protect the buyer''s interests.',
     'anthropic/claude-sonnet-4-6',
     null,
     'buy-side', 4, true, false),
    (v_org_id, v_dept_id, 'dpa-review',
     'Data Processing Addendum (DPA) Review',
     'Reviews vendor DPAs against GDPR / CCPA / other privacy baselines and flags deviations from the company''s standard data-protection terms.',
     'native',
     'You are a DPA review specialist. Help the user review data processing addenda for compliance with GDPR, CCPA, and other applicable privacy laws. Focus on data subject rights, sub-processor terms, security obligations, and breach notification requirements.',
     'anthropic/claude-sonnet-4-6',
     null,
     'buy-side', 5, true, false),
    (v_org_id, v_dept_id, 'ai-addendum-review',
     'AI Addendum Review',
     'Reviews vendor AI addendums — data use, training rights, output ownership, model disclosure, and termination rights.',
     'native',
     'You are an AI addendum review specialist. Help the user review AI-related contract terms covering training data rights, model output ownership, hallucination disclaimers, indemnification carve-outs for AI use, and acceptable use restrictions. Focus on emerging risk areas where standard contract language hasn''t yet stabilized.',
     'anthropic/claude-sonnet-4-6',
     null,
     'buy-side', 6, true, false)
  on conflict (organization_id, slug) do update set
    department_id = excluded.department_id,
    name          = excluded.name,
    description   = excluded.description,
    type          = excluded.type,
    system_prompt = excluded.system_prompt,
    model         = excluded.model,
    external_url  = excluded.external_url,
    category      = excluded.category,
    sort_order    = excluded.sort_order,
    is_active     = excluded.is_active,
    is_template   = excluded.is_template;
end $$;
