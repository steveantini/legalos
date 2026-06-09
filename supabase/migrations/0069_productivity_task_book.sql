-- ============================================================================
-- 0069_productivity_task_book.sql
-- Analytics arc, productivity calculator Step A — org-scoped task book
-- ============================================================================
--
-- Promotes the Productivity Calculator's task book out of the browser
-- (localStorage `launchpad_calculator_data`) into an org-scoped database store,
-- so the assumptions persist for the organization and every admin works from the
-- same figures (and so Step B can later feed each user's Impact cells from it).
--
-- ONE ROW PER ORG: organization_id is the primary key. The row holds only the
-- HUMAN-SUPPLIED assumptions as a single JSONB config (team members + salaries,
-- task-type definitions with their per-run time-without/time-with estimates and
-- optional agent mapping, and the editable platform cost-per-user). The MEASURED
-- run volumes are NOT stored here — they are read live from usage_events at view
-- time, so the calculator always reflects current real usage.
--
-- A single JSONB config (rather than normalized rows) mirrors how the
-- localStorage blob worked, keeps the whole editable book one atomic upsert, and
-- needs no migration when the assumption shape evolves. The app validates the
-- shape with zod on read and write.
--
-- RLS: read by any member of the org (an admin viewing the calculator), write by
-- super admins only — the calculator's task book is an org-governance artifact,
-- so it mirrors the connection-policy / content-settings write gate
-- (super_admin only; other admins see it read-only). current_org_id() and
-- current_user_role() are the existing SECURITY DEFINER helpers.
--
-- Apply in the Supabase SQL Editor. Additive; the calculator tolerates the table
-- being absent (falls back to an empty default book), so deploy order is free.
-- ============================================================================

create table public.productivity_task_book (
  organization_id  uuid primary key references public.organizations (id) on delete cascade,
  config           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.productivity_task_book is
  'One row per org: the human-supplied assumptions for the Productivity Calculator (team members + salaries, task-type definitions with per-run time estimates and optional agent mapping, editable cost-per-user) as a single JSONB config. Measured run volumes are NOT stored here — they are read live from usage_events. Read by org members; written by super admins (RLS).';

create trigger productivity_task_book_updated_at
  before update on public.productivity_task_book
  for each row execute function public.set_updated_at();

alter table public.productivity_task_book enable row level security;


-- ============================================================================
-- RLS Policies
-- ============================================================================
-- READ: any authenticated member of the org (the calculator is admin-reached via
-- the admin layout; this keeps the data org-scoped). WRITE: super admins only.

create policy productivity_task_book_read_org
  on public.productivity_task_book
  for select
  using (organization_id = public.current_org_id());

create policy productivity_task_book_super_admin_write
  on public.productivity_task_book
  for all
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- table + RLS present
--   select relname, relrowsecurity from pg_class where relname = 'productivity_task_book';
--   -- expect: relrowsecurity = true
--
--   -- policies present (read-org + super-admin write)
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.productivity_task_book'::regclass order by polname;
--   -- expect: productivity_task_book_read_org (r), productivity_task_book_super_admin_write (*)
--
--   -- one row per org once saved (none until a super admin saves the book)
--   select organization_id, jsonb_typeof(config) from public.productivity_task_book;
-- ============================================================================
--
-- Rollback (if ever needed):
--   drop table if exists public.productivity_task_book;
-- ============================================================================
