-- ============================================================================
-- legal-department-launchpad-template
-- Initial schema (v0) — Phase 1
-- ============================================================================
--
-- Creates core tables for auth, organizations, departments, role-based access,
-- and agents. All tables have Row-Level Security enabled with explicit policies.
--
-- Run this once in the Supabase SQL Editor against a fresh project.
-- To re-run cleanly during development, drop the schema first:
--   drop schema public cascade; create schema public;
-- ============================================================================


-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()


-- ============================================================================
-- Helper: updated_at trigger function
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================================
-- Table: organizations
-- ============================================================================
-- A tenant. Single-tenant deployments have one row; multi-tenant (Phase 9) can
-- have many. Every other org-scoped table carries organization_id.

create table public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;


-- ============================================================================
-- Table: users
-- ============================================================================
-- Application-level user profile, joined 1:1 to Supabase auth.users via id.
-- The `role` column is organization-level (super_admin, org_admin, user).
-- Department-level roles live in user_department_roles.

create type public.user_role as enum ('super_admin', 'org_admin', 'user');

create table public.users (
  id               uuid primary key references auth.users (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  email            text not null,
  full_name        text,
  role             public.user_role not null default 'user',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index users_organization_id_idx on public.users (organization_id);
create index users_email_idx on public.users (email);

create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

alter table public.users enable row level security;


-- ============================================================================
-- Table: departments
-- ============================================================================
-- Legal departments (Commercial, M&A, Public Sector, etc.). Org-scoped.

create table public.departments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  slug             text not null,
  name             text not null,
  description      text,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug)
);

create index departments_organization_id_idx on public.departments (organization_id);

create trigger departments_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

alter table public.departments enable row level security;


-- ============================================================================
-- Table: user_department_roles
-- ============================================================================
-- Join table granting a user a role within a specific department.
-- A user may have rows for multiple departments with different roles.

create type public.department_role as enum ('dept_admin', 'user');

create table public.user_department_roles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  department_id  uuid not null references public.departments (id) on delete cascade,
  role           public.department_role not null default 'user',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, department_id)
);

create index user_department_roles_user_id_idx on public.user_department_roles (user_id);
create index user_department_roles_department_id_idx on public.user_department_roles (department_id);

create trigger user_department_roles_updated_at
  before update on public.user_department_roles
  for each row execute function public.set_updated_at();

alter table public.user_department_roles enable row level security;


-- ============================================================================
-- Table: agents
-- ============================================================================
-- All agents — external (link out) and native (in-app chat). Department-scoped.
-- System prompts and model live here for native agents; external_url for external.

create type public.agent_type as enum ('external', 'native');

create table public.agents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  department_id    uuid not null references public.departments (id) on delete restrict,
  slug             text not null,
  name             text not null,
  description      text,
  type             public.agent_type not null,
  external_url     text,
  system_prompt    text,
  model            text,          -- e.g. 'claude-opus-4-7'
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug),
  -- Enforce shape consistency by type
  constraint agents_external_requires_url
    check (type <> 'external' or external_url is not null),
  constraint agents_native_requires_prompt
    check (type <> 'native' or (system_prompt is not null and model is not null))
);

create index agents_organization_id_idx on public.agents (organization_id);
create index agents_department_id_idx on public.agents (department_id);

create trigger agents_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

alter table public.agents enable row level security;


-- ============================================================================
-- Helper functions for RLS
-- ============================================================================
-- Centralized authorization checks. Server actions also call these at the
-- application layer; RLS is the last-line enforcement.

-- Returns the current user's organization_id, or null if not signed in / not
-- provisioned in public.users yet.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid();
$$;

-- Returns the current user's org-level role, or null.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- True if the current user has any role in the given department.
create or replace function public.has_department_access(dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_department_roles
    where user_id = auth.uid() and department_id = dept_id
  );
$$;

-- True if the current user is dept_admin for the given department OR is org_admin/super_admin.
create or replace function public.is_department_admin(dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('super_admin', 'org_admin')
    or exists (
      select 1 from public.user_department_roles
      where user_id = auth.uid()
        and department_id = dept_id
        and role = 'dept_admin'
    );
$$;


-- ============================================================================
-- RLS Policies: organizations
-- ============================================================================
-- Users can only read their own organization. Only super_admin can write.

create policy organizations_read_own
  on public.organizations
  for select
  using (id = public.current_org_id());

create policy organizations_super_admin_write
  on public.organizations
  for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');


-- ============================================================================
-- RLS Policies: users
-- ============================================================================
-- Users can read other users in their own org. Users can update their own profile.
-- Only org_admin or super_admin can insert/delete users or change roles.

create policy users_read_same_org
  on public.users
  for select
  using (organization_id = public.current_org_id());

create policy users_update_self
  on public.users
  for update
  using (id = auth.uid())
  with check (id = auth.uid() and organization_id = public.current_org_id());

create policy users_org_admin_manage
  on public.users
  for all
  using (
    public.current_user_role() in ('super_admin', 'org_admin')
    and organization_id = public.current_org_id()
  )
  with check (
    public.current_user_role() in ('super_admin', 'org_admin')
    and organization_id = public.current_org_id()
  );


-- ============================================================================
-- RLS Policies: departments
-- ============================================================================
-- All users in an org can read active departments. Only org_admin writes.

create policy departments_read_same_org
  on public.departments
  for select
  using (organization_id = public.current_org_id());

create policy departments_org_admin_write
  on public.departments
  for all
  using (
    public.current_user_role() in ('super_admin', 'org_admin')
    and organization_id = public.current_org_id()
  )
  with check (
    public.current_user_role() in ('super_admin', 'org_admin')
    and organization_id = public.current_org_id()
  );


-- ============================================================================
-- RLS Policies: user_department_roles
-- ============================================================================
-- Users can read their own assignments. org_admin and the relevant dept_admin
-- can manage assignments for their department.

create policy udr_read_own
  on public.user_department_roles
  for select
  using (user_id = auth.uid());

create policy udr_admin_read_dept
  on public.user_department_roles
  for select
  using (public.is_department_admin(department_id));

create policy udr_admin_write
  on public.user_department_roles
  for all
  using (public.is_department_admin(department_id))
  with check (public.is_department_admin(department_id));


-- ============================================================================
-- RLS Policies: agents
-- ============================================================================
-- Users can read active agents in departments they have access to.
-- dept_admin (for that department) or org_admin can manage agents.

create policy agents_read_accessible
  on public.agents
  for select
  using (
    is_active = true
    and organization_id = public.current_org_id()
    and public.has_department_access(department_id)
  );

create policy agents_admin_read_all
  on public.agents
  for select
  using (
    organization_id = public.current_org_id()
    and public.is_department_admin(department_id)
  );

create policy agents_admin_write
  on public.agents
  for all
  using (
    organization_id = public.current_org_id()
    and public.is_department_admin(department_id)
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_department_admin(department_id)
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Next steps (handled in SETUP.md Part 3f):
--   1. Seed an organization row.
--   2. Seed the five starting departments.
--   3. Sign up via magic link in the app, then promote yourself to org_admin
--      and grant dept_admin for all departments.
--
-- Phase 2 migration (0002_native_agents.sql) will add:
--   - conversations
--   - messages
--   - usage_events
-- with their own RLS policies.
-- ============================================================================
