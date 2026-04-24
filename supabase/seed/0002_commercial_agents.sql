-- ============================================================================
-- 0002_commercial_agents.sql — Commercial department agent seed
-- ============================================================================
--
-- Seeds six external agents into the Commercial department:
--   sell-side: Enterprise Agreement Review, Mutual NDA Review,
--              Order Form & SOW Review
--   buy-side:  Vendor Agreement Review, DPA Review, AI Addendum Review
--
-- Placeholder URLs follow the pattern
-- https://gemini.google.com/gem/placeholder-<slug>
-- so forkers can grep for 'placeholder-' to find everything that needs a
-- real URL before production.
--
-- Idempotent: ON CONFLICT (organization_id, slug) DO UPDATE. Safe to re-run.
--
-- Prereqs:
--   1. supabase/seed/0001_org_and_departments.sql has been run
--      (organization + Commercial department exist).
--   2. supabase/migrations/0003_agents_category.sql has been applied
--      (agents table has a `category` column).
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
    external_url, category, sort_order, is_active
  )
  values
    (v_org_id, v_dept_id, 'enterprise-agreement-review',
     'Enterprise Agreement Review',
     'Reviews enterprise customer agreements — issue-spotting, redline analysis, and clause comparison against a standard playbook.',
     'external',
     'https://gemini.google.com/gem/placeholder-enterprise-agreement-review',
     'sell-side', 1, true),
    (v_org_id, v_dept_id, 'mutual-nda-review',
     'Mutual NDA Review',
     'Reviews mutual non-disclosure agreements, flags non-standard clauses (term, jurisdiction, residuals), and suggests fallback language.',
     'external',
     'https://gemini.google.com/gem/placeholder-mutual-nda-review',
     'sell-side', 2, true),
    (v_org_id, v_dept_id, 'order-form-sow-review',
     'Order Form & SOW Review',
     'Reviews order forms and statements of work for consistency with the master agreement and standard commercial terms.',
     'external',
     'https://gemini.google.com/gem/placeholder-order-form-sow-review',
     'sell-side', 3, true),
    (v_org_id, v_dept_id, 'vendor-agreement-review',
     'Vendor Agreement Review',
     'Reviews inbound vendor and SaaS agreements — liability, indemnity, IP, termination, and renewal triggers.',
     'external',
     'https://gemini.google.com/gem/placeholder-vendor-agreement-review',
     'buy-side', 4, true),
    (v_org_id, v_dept_id, 'dpa-review',
     'Data Processing Addendum (DPA) Review',
     'Reviews vendor DPAs against GDPR / CCPA / other privacy baselines and flags deviations from the company''s standard data-protection terms.',
     'external',
     'https://gemini.google.com/gem/placeholder-dpa-review',
     'buy-side', 5, true),
    (v_org_id, v_dept_id, 'ai-addendum-review',
     'AI Addendum Review',
     'Reviews vendor AI addendums — data use, training rights, output ownership, model disclosure, and termination rights.',
     'external',
     'https://gemini.google.com/gem/placeholder-ai-addendum-review',
     'buy-side', 6, true)
  on conflict (organization_id, slug) do update set
    department_id = excluded.department_id,
    name          = excluded.name,
    description   = excluded.description,
    type          = excluded.type,
    external_url  = excluded.external_url,
    category      = excluded.category,
    sort_order    = excluded.sort_order,
    is_active     = excluded.is_active;
end $$;
