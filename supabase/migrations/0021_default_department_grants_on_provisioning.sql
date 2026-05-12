-- ============================================================================
-- legalOS
-- Migration 0021 — default department grants on first user provisioning
--                   (Session 29)
-- ============================================================================
--
-- Extends public.ensure_user_provisioned() (migration 0002) with a tail
-- block that also creates user_department_roles rows from the org's
-- defaults — but only when the user has zero existing grants.
--
-- Semantic: defaults apply once, at first provisioning. An admin who
-- later revokes a default grant does NOT see it re-applied on the user's
-- next request. The "first provisioning" check is "user has zero rows
-- in user_department_roles," not "user is newly inserted into users" —
-- this handles the historical case where a user might already exist in
-- public.users (provisioned before this migration landed) but have no
-- dept grants yet. They receive defaults on their next authenticated
-- request, exactly once. Any existing grant — manual, defaults-applied,
-- or seed-inserted — blocks further automatic defaults.
--
-- All inserts are wrapped in an EXCEPTION block matching the existing
-- function's error-swallowing pattern. Defaults insertion failures must
-- not block the request; the user can be granted access manually via
-- the admin UI if a defaults insert fails for any reason.
--
-- CREATE OR REPLACE preserves the existing privilege grants from 0002
-- (revoke from public, grant to authenticated) without re-issuing them.
-- ============================================================================

create or replace function public.ensure_user_provisioned()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id      uuid;
  v_grant_count integer;
begin
  -- ----------------------------------------------------------------------
  -- Stage 1: ensure public.users row exists (preserved from 0002).
  -- ----------------------------------------------------------------------

  if not exists (select 1 from public.users where id = auth.uid()) then
    -- Find the (single-tenant) organization. If none exists yet (seed
    -- has not been run), silently return — the seed script will create
    -- the user row when it runs.
    select id
      into v_org_id
      from public.organizations
      order by created_at asc
      limit 1;

    if v_org_id is null then
      return;
    end if;

    -- Provision with role='user'. org_admin promotion is a deliberate
    -- operation handled by the seed script (first install) or by the
    -- org_admin management UI (Phase 5).
    insert into public.users (id, organization_id, email, role, is_active)
    select auth.uid(), v_org_id, coalesce(u.email, ''), 'user', true
      from auth.users u
      where u.id = auth.uid()
    on conflict (id) do nothing;
  end if;

  -- ----------------------------------------------------------------------
  -- Stage 2: apply org default department grants on first provisioning.
  --
  -- "First provisioning" = zero existing user_department_roles rows for
  -- the caller. Once a user has any grant (manual or defaults-applied),
  -- defaults are not re-applied.
  -- ----------------------------------------------------------------------

  select count(*)
    into v_grant_count
    from public.user_department_roles
    where user_id = auth.uid();

  if v_grant_count = 0 then
    -- Resolve the org id from the just-inserted (or pre-existing) row.
    select organization_id
      into v_org_id
      from public.users
      where id = auth.uid();

    if v_org_id is null then
      return;
    end if;

    begin
      insert into public.user_department_roles (user_id, department_id, role)
      select auth.uid(), odd.department_id, 'user'
        from public.organization_default_departments odd
       where odd.organization_id = v_org_id
      on conflict (user_id, department_id) do nothing;
    exception when others then
      -- Best-effort: failures here must not block the request. The
      -- admin can grant access manually via the /workspace/admin/users
      -- page if a defaults insert ever fails.
      null;
    end;
  end if;
end;
$$;

-- The privilege grants from 0002 (revoke from public + grant to authenticated)
-- persist across CREATE OR REPLACE; no need to re-issue.


-- ============================================================================
-- Reverse: restore the 0002 function body (no defaults stage).
--
--   create or replace function public.ensure_user_provisioned()
--   returns void
--   language plpgsql
--   security definer
--   set search_path = public, pg_temp
--   as $$
--   declare
--     v_org_id uuid;
--   begin
--     if exists (select 1 from public.users where id = auth.uid()) then
--       return;
--     end if;
--     select id
--       into v_org_id
--       from public.organizations
--       order by created_at asc
--       limit 1;
--     if v_org_id is null then
--       return;
--     end if;
--     insert into public.users (id, organization_id, email, role, is_active)
--     select auth.uid(), v_org_id, coalesce(u.email, ''), 'user', true
--     from auth.users u
--     where u.id = auth.uid()
--     on conflict (id) do nothing;
--   end;
--   $$;
--
-- Reversing does NOT clean up rows previously granted via the defaults
-- block; those user_department_roles rows persist and are independently
-- revocable via the admin UI.
-- ============================================================================
