-- ============================================================================
-- 0001_org_and_departments.sql — seed data for a fresh deployment
-- ============================================================================
--
-- REPLACE `ADMIN_EMAIL_REPLACE_ME` BELOW WITH YOUR EMAIL ADDRESS BEFORE RUNNING.
-- That email must already exist in auth.users (i.e., you have signed in via
-- magic link at least once). The seed promotes that email's auth user to
-- `org_admin` and grants dept_admin access to all eight departments.
--
-- This script is idempotent: safe to re-run. It uses ON CONFLICT DO UPDATE /
-- DO NOTHING so re-running updates rather than duplicating.
--
-- Run this in the Supabase SQL Editor against your project.
-- ============================================================================

do $$
declare
  v_admin_email text := 'ADMIN_EMAIL_REPLACE_ME';
  v_org_id uuid;
  v_user_id uuid;
begin
  -- 1. Organization (one row, single-tenant deployment).
  insert into public.organizations (name, slug)
  values ('Your Company, Inc.', 'your-company')
  on conflict (slug) do update set name = excluded.name
  returning id into v_org_id;

  -- Defensive: if ON CONFLICT path didn't populate the variable, look it up.
  if v_org_id is null then
    select id into v_org_id from public.organizations where slug = 'your-company';
  end if;

  -- 2. The eight starting departments.
  --
  -- Canonical state after migrations 0013 (GRRA merged into Public
  -- Sector + General Tools added), 0028 (M&A renamed to Corporate),
  -- and 0029 (Corporate description broadened). The seed had drifted
  -- from live DB across all three; this list is the corrected
  -- documentation of "what a fresh DB looks like once 0001..N are
  -- applied in order." If you add a new department in a later
  -- migration, update this list in the same commit.
  insert into public.departments (organization_id, slug, name, description, sort_order)
  values
    (v_org_id, 'commercial', 'Commercial',
      'Revenue (sell-side) agreements, procurement (buy-side) agreements, Non-Disclosure Agreements, Artificial Intelligence Addenda.', 1),
    (v_org_id, 'public-sector', 'Public Sector',
      'Government relations, regulatory affairs, public-sector contracts, and policy advocacy.', 2),
    (v_org_id, 'corporate', 'Corporate',
      'Mergers, financing, governance, securities, and entity management.', 3),
    (v_org_id, 'privacy', 'Privacy',
      'Data privacy, DPAs, regulatory compliance (GDPR, CCPA, etc.).', 4),
    (v_org_id, 'product', 'Product',
      'Product launches, feature reviews, terms updates, and product-counsel partnerships.', 5),
    (v_org_id, 'compliance', 'Compliance',
      'Compliance program management, regulatory monitoring, and audit support.', 6),
    (v_org_id, 'operations', 'Operations',
      'Internal operations, vendor management, procurement, and corporate transactions.', 7),
    (v_org_id, 'general-tools', 'General Tools',
      'general purpose agentic tools', 8)
  on conflict (organization_id, slug) do update set
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

  -- 3. Resolve the admin auth user id.
  select id into v_user_id
    from auth.users
   where email = v_admin_email
   limit 1;

  if v_user_id is null then
    raise exception
      'auth.users row not found for email %. Sign in via magic link first, then re-run this seed.',
      v_admin_email;
  end if;

  -- 4. Promote the admin: upsert public.users with role=org_admin. If the
  --    proxy has already provisioned this user with role='user', this
  --    UPDATEs them to org_admin.
  insert into public.users (id, organization_id, email, role, is_active)
  values (v_user_id, v_org_id, v_admin_email, 'org_admin', true)
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    email = excluded.email,
    role = 'org_admin',
    is_active = true;

  -- 5. Grant dept_admin access to every department.
  insert into public.user_department_roles (user_id, department_id, role)
  select v_user_id, d.id, 'dept_admin'
    from public.departments d
   where d.organization_id = v_org_id
  on conflict (user_id, department_id) do update set role = 'dept_admin';
end $$;
