-- ============================================================================
-- legalOS
-- Migration 0015 — tighten org-wide read policies on users + departments
--                    (Phase 2, Session 20 Step C — RLS leak fixes)
-- ============================================================================
--
-- Background. Session 20 Step B recon identified two over-permissive RLS
-- policies on `public.users` and `public.departments` from migration 0001.
-- Both gated reads on a single condition:
--
--   organization_id = public.current_org_id()
--
-- Combined with `ensure_user_provisioned()` (migration 0002) which auto-
-- inserts every authenticated user into the single-tenant org as
-- role='user', the practical effect was:
--
--   - Anyone who completes magic-link auth becomes an org member with
--     no department roles.
--   - Once a member, they could `supabase.from('users').select('*')`
--     from the browser (via the publicly-readable anon key) and dump
--     every other member's id, email, full_name, role, is_active.
--   - They could likewise enumerate every department's slug, name,
--     and description.
--
-- The application UI does not expose either list to non-admins, but the
-- data is one line of console JS away. For a private operator-only
-- deployment this is uncomfortable; for any rollout where authenticated
-- users include non-team-members it's a real privacy issue.
--
-- This migration replaces both policies with department-scoped variants
-- that preserve admin paths (org_admin / super_admin keep full org-wide
-- visibility, since admin pages and user-management UIs depend on it)
-- and grant non-admins read access only where they have a legitimate
-- relationship.
--
-- Replacement policies:
--
--   public.users   →  users_read_self_or_dept_peer_or_admin
--                     (a) yourself (always),
--                     (b) anyone in your org if you're org/super admin,
--                     (c) users who share at least one department
--                         membership with you (peer visibility within
--                         the same department, needed for future
--                         dept-internal surfaces — share dialogs,
--                         mention pickers, etc.).
--
--   public.departments → departments_read_accessible_or_admin
--                     (a) all departments in your org if you're
--                         org/super admin,
--                     (b) departments where you have any role (joined
--                         to public.user_department_roles via
--                         has_department_access(id)).
--
-- For a stranger auto-provisioned with no roles: zero rows visible from
-- either table. They can still see their own users row (clause a). They
-- can no longer enumerate the department list to discover routes.
--
-- Idempotence. `drop policy if exists` makes this safe to re-run; the
-- transaction ensures both policies flip together.
-- ============================================================================

begin;

-- public.users -------------------------------------------------------------

-- Drop the over-permissive policy from 0001.
drop policy if exists users_read_same_org on public.users;

-- Replace with the scoped policy.
create policy users_read_self_or_dept_peer_or_admin
  on public.users
  for select
  using (
    organization_id = public.current_org_id()
    and (
      id = auth.uid()
      or public.current_user_role() in ('org_admin', 'super_admin')
      or exists (
        select 1
        from public.user_department_roles caller
        inner join public.user_department_roles target
          on target.department_id = caller.department_id
        where caller.user_id = auth.uid()
          and target.user_id = public.users.id
      )
    )
  );


-- public.departments -------------------------------------------------------

-- Drop the over-permissive policy from 0001.
drop policy if exists departments_read_same_org on public.departments;

-- Replace with the scoped policy. Uses `has_department_access(id)` from
-- 0001 — a stable security-definer SQL function that joins through
-- user_department_roles. org/super admins keep full visibility because
-- admin pages need to see every department in the org.
create policy departments_read_accessible_or_admin
  on public.departments
  for select
  using (
    organization_id = public.current_org_id()
    and (
      public.current_user_role() in ('org_admin', 'super_admin')
      or public.has_department_access(id)
    )
  );


commit;


-- ============================================================================
-- Reverse (only if the new policies cause regressions; restores 0001 shape):
--
--   begin;
--   drop policy if exists users_read_self_or_dept_peer_or_admin on public.users;
--   drop policy if exists departments_read_accessible_or_admin on public.departments;
--
--   create policy users_read_same_org
--     on public.users
--     for select
--     using (organization_id = public.current_org_id());
--
--   create policy departments_read_same_org
--     on public.departments
--     for select
--     using (organization_id = public.current_org_id());
--   commit;
-- ============================================================================
