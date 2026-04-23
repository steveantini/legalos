-- ============================================================================
-- 0001_org_and_departments.sql — seed data for a fresh deployment
-- ============================================================================
--
-- REPLACE `ADMIN_EMAIL_REPLACE_ME` BELOW WITH YOUR EMAIL ADDRESS BEFORE RUNNING.
-- That email must already exist in auth.users (i.e., you have signed in via
-- magic link at least once). The seed promotes that email's auth user to
-- `org_admin` and grants dept_admin access to all five departments.
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

  -- 2. The five starting departments.
  insert into public.departments (organization_id, slug, name, description, sort_order)
  values
    (v_org_id, 'commercial', 'Commercial',
      'Contract review, vendor agreements, commercial operations.', 1),
    (v_org_id, 'ma', 'Mergers & Acquisitions',
      'Deal diligence, merger agreements, integration planning.', 2),
    (v_org_id, 'public-sector', 'Public Sector',
      'Government contracts and public-sector matters.', 3),
    (v_org_id, 'grra', 'Government Relations & Regulatory Affairs',
      'Lobbying, regulatory monitoring, policy advocacy.', 4),
    (v_org_id, 'privacy', 'Privacy',
      'Data privacy, DPAs, regulatory compliance (GDPR, CCPA, etc.).', 5)
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
