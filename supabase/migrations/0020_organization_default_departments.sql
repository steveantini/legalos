-- ============================================================================
-- legalOS
-- Migration 0020 — organization_default_departments + open-read departments
--                   (Session 29 — D-035 sunset; per-user access activated)
-- ============================================================================
--
-- Two related changes, bundled into one migration since they share a single
-- domain ("activate the real per-user access model"):
--
-- 1. New table public.organization_default_departments. Records the set of
--    departments that should be auto-granted to a new user at first
--    provisioning time. Admin-configurable from the /workspace/admin/users
--    page (Session 29). Org-admin write-gated; open-read inside the org so
--    every member can see what they would have been granted on signup.
--
-- 2. Replace the departments_read_accessible_or_admin policy from migration
--    0015 with a simpler departments_read_same_org policy. Department names
--    and descriptions are not sensitive — surfacing locked-but-visible
--    departments to users is a deliberate UX choice (Notion / Linear / Slack
--    convention: "show what exists, gate access"). The 0015 tighter policy
--    was prophylactic, not load-bearing; agents inside each department
--    remain RLS-gated via agents_read_accessible (has_department_access).
--
-- D-035 (open-signup posture: every authenticated user lands on all 8
-- departments) is effectively retired by this migration plus 0021. New
-- users are now provisioned with only the org's default departments.
-- The LOCKED_DEPARTMENT_SLUGS UI placeholder in app/workspace/page.tsx
-- is retired in the same session.
--
-- Idempotence: section 1 creates a new table (single shot). Sections 2 + 3
-- use ON CONFLICT DO NOTHING / DROP POLICY IF EXISTS so the migration is
-- safe to re-run.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------
-- 1. Table: organization_default_departments
-- ----------------------------------------------------------------------

create table public.organization_default_departments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  department_id    uuid not null references public.departments (id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (organization_id, department_id)
);

create index organization_default_departments_org_id_idx
  on public.organization_default_departments (organization_id);

alter table public.organization_default_departments enable row level security;

-- Read: any user in the org can see the defaults list. The list describes
-- what they would have been granted on signup — not sensitive.
create policy organization_default_departments_read_same_org
  on public.organization_default_departments
  for select
  using (organization_id = public.current_org_id());

-- Write: super_admin / org_admin only, mirroring the
-- departments_org_admin_write predicate from migration 0001.
create policy organization_default_departments_org_admin_write
  on public.organization_default_departments
  for all
  using (
    public.current_user_role() in ('super_admin', 'org_admin')
    and organization_id = public.current_org_id()
  )
  with check (
    public.current_user_role() in ('super_admin', 'org_admin')
    and organization_id = public.current_org_id()
  );


-- ----------------------------------------------------------------------
-- 2. Backfill: commercial + general-tools as defaults for every org.
--
-- Generic clause keyed on slug (no hardcoded UUIDs) so the backfill works
-- across dev / prod regardless of insertion order. ON CONFLICT DO NOTHING
-- makes re-runs no-ops.
-- ----------------------------------------------------------------------

insert into public.organization_default_departments (organization_id, department_id)
select o.id, d.id
  from public.organizations o
  cross join public.departments d
 where d.slug in ('commercial', 'general-tools')
   and d.organization_id = o.id
on conflict (organization_id, department_id) do nothing;


-- ----------------------------------------------------------------------
-- 3. Relax the departments SELECT policy.
--
-- 0015 introduced departments_read_accessible_or_admin, which scoped reads
-- to either (a) org-admins or (b) members with a user_department_roles
-- row for the department. With Session 29's UX shift to "locked but
-- visible," every org member needs to read every department's name +
-- description + slug to render the locked card / locked rail entry.
-- ----------------------------------------------------------------------

drop policy if exists departments_read_accessible_or_admin on public.departments;

create policy departments_read_same_org
  on public.departments
  for select
  using (organization_id = public.current_org_id());

commit;


-- ============================================================================
-- Reverse (only if the new shape causes a regression).
--
--   begin;
--     drop policy if exists departments_read_same_org on public.departments;
--     create policy departments_read_accessible_or_admin
--       on public.departments
--       for select
--       using (
--         organization_id = public.current_org_id()
--         and (
--           public.current_user_role() in ('org_admin', 'super_admin')
--           or public.has_department_access(id)
--         )
--       );
--
--     drop table if exists public.organization_default_departments;
--   commit;
--
-- Note: rolling back the table does NOT re-apply prior default grants to
-- existing users — those rows are in user_department_roles and outlive
-- the defaults table. 0021's ensure_user_provisioned extension is also
-- independent of this migration's reverse.
-- ============================================================================
