-- ============================================================================
-- 0049_user_deactivation_and_status_audit.sql
-- Admin milestone A3b (People) — soft user deactivation + status audit
-- ============================================================================
--
-- A3b makes users.is_active load-bearing. Until now it was inert (set true at
-- provisioning, read only for display). Deactivation is a reversible soft block:
-- flipping is_active to false removes a person's access (enforced at the request
-- layer: proxy, auth callback, workspace layout) and destroys nothing — their
-- agents, connections, grants, conversations, department roles, and audit rows
-- all remain. Reactivation (is_active = true) restores access with everything
-- intact. This is NOT hard-delete (prohibited/destructive); there is no cascade.
--
-- This migration adds three things:
--   1. user_status_audit — one append-only row per is_active change, written by
--      the trigger (mirrors role_change_audit's FK/RLS pattern). Viewer is A6.
--   2. enforce_user_deactivation — a BEFORE UPDATE OF is_active trigger that
--      enforces the gating rule (separation of duties + last-active-super-admin
--      lockout) and records the audit row. A SIBLING of the A3a role trigger
--      (not an overload), since the two concerns guard different transitions and
--      audit to different tables.
--   3. A coupling fix to the A3a role trigger (enforce_user_role_change, 0048):
--      its last-super-admin count now also requires is_active, so a DEACTIVATED
--      super_admin no longer counts as lockout protection when guarding against
--      demoting the last one. Once is_active is load-bearing, only ACTIVE super
--      admins protect against org lockout.
--
-- The gating rule (mirrors A3a's escalation rule):
--   * super_admin may deactivate/reactivate any user.
--   * org_admin may deactivate/reactivate user and org_admin accounts, but NOT a
--     super_admin.
--   * The org's LAST ACTIVE super_admin cannot be deactivated (lockout), for
--     every actor including self-deactivation.
--   * (Self-deactivation confirmation is a UI concern; the DB enforces the
--     last-active-super-admin guard.)
--
-- Enforcement layering (mirror-RLS, D-041): the server action mirrors this rule
-- for friendly errors; this trigger is the authoritative guard no crafted request
-- can bypass. It also closes the is_active self-update hole (users_update_self
-- lets a user update their own row; a non-admin flipping is_active is rejected).
--
-- APPLY ORDERING (important). Apply this migration BEFORE the deactivate control
-- is used. The roster and role editor from A3a keep working without it; the
-- deactivate control's safety depends on this trigger. The request-layer block
-- (proxy/callback/layout) is independent and correct whether or not this is
-- applied — it just reads is_active. Recommended: apply this migration, then use
-- the deactivate control.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- Idempotent: create-table-if-not-exists, create-or-replace functions,
-- drop-trigger-if-exists before create.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------
-- 1. Table: user_status_audit
-- ----------------------------------------------------------------------
-- One row per committed is_active change (deactivation OR reactivation).
-- FKs are nullable with ON DELETE SET NULL (mirroring role_change_audit and
-- agents.created_by) so a future hard-delete of a user never destroys the trail.

create table if not exists public.user_status_audit (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations (id) on delete cascade,
  actor_user_id    uuid references public.users (id) on delete set null,  -- who made the change; null if SQL/console or actor later deleted
  target_user_id   uuid references public.users (id) on delete set null,  -- whose status changed; null if later deleted
  old_is_active    boolean not null,
  new_is_active    boolean not null,
  created_at       timestamptz not null default now()
);

create index if not exists user_status_audit_org_id_idx
  on public.user_status_audit (organization_id);
create index if not exists user_status_audit_target_user_id_idx
  on public.user_status_audit (target_user_id);
create index if not exists user_status_audit_created_at_idx
  on public.user_status_audit (created_at desc);

alter table public.user_status_audit enable row level security;

-- Read: org/super admins read their own org's rows. No INSERT/UPDATE/DELETE
-- policy by design — the SECURITY DEFINER trigger is the only writer; the table
-- is append-only from the application's point of view.
drop policy if exists user_status_audit_admin_read on public.user_status_audit;
create policy user_status_audit_admin_read
  on public.user_status_audit
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ----------------------------------------------------------------------
-- 2. Trigger function: enforce_user_deactivation
-- ----------------------------------------------------------------------
-- BEFORE UPDATE OF is_active on public.users. Validates the status transition
-- against the gating rule and the last-active-super-admin guard, then records the
-- audit row. SECURITY DEFINER so the sibling-count query and the audit INSERT
-- bypass RLS and are accurate/authorized regardless of the invoking user's
-- policies. current_user_role() and auth.uid() still resolve to the actual actor.

create or replace function public.enforce_user_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role                    public.user_role;
  v_remaining_active_super_admins integer;
begin
  -- Act only when is_active actually changes. Role and profile updates pass
  -- through untouched even though the trigger is scoped to `OF is_active`.
  if new.is_active is not distinct from old.is_active then
    return new;
  end if;

  v_actor_role := public.current_user_role();

  -- Rule 1 — only administrators may change a user's status. This also closes
  -- the self-update hole: `users_update_self` lets a user update their own row,
  -- but a non-admin (or unauthenticated) actor flipping is_active is rejected.
  if v_actor_role is null or v_actor_role = 'user' then
    raise exception using
      errcode = '42501',
      message = 'Only administrators can change a user status.';
  end if;

  -- Rule 2 — org_admin separation of duties: may not change a super_admin's
  -- status (deactivate or reactivate). Mirrors the role trigger's rule.
  if v_actor_role = 'org_admin' and old.role = 'super_admin' then
    raise exception using
      errcode = '42501',
      message = 'Only a super admin can change a super admin''s status.';
  end if;

  -- Rule 3 — last-active-super-admin lockout protection. Refuse to deactivate
  -- the org's only remaining active super_admin (every actor, incl. self).
  if old.is_active = true
     and new.is_active = false
     and old.role = 'super_admin' then
    select count(*)
      into v_remaining_active_super_admins
      from public.users
     where organization_id = old.organization_id
       and role = 'super_admin'
       and is_active
       and id <> old.id;
    if v_remaining_active_super_admins = 0 then
      raise exception using
        errcode = '42501',
        message = 'Your organization must keep at least one active super admin.';
    end if;
  end if;

  -- Passed every guard — record the change (append-only), exactly once,
  -- including direct SQL. Captures both deactivation and reactivation.
  insert into public.user_status_audit
    (organization_id, actor_user_id, target_user_id, old_is_active, new_is_active)
  values
    (old.organization_id, auth.uid(), old.id, old.is_active, new.is_active);

  return new;
end;
$$;

revoke execute on function public.enforce_user_deactivation() from public;

drop trigger if exists users_enforce_deactivation on public.users;
create trigger users_enforce_deactivation
  before update of is_active on public.users
  for each row
  execute function public.enforce_user_deactivation();


-- ----------------------------------------------------------------------
-- 3. Coupling fix: tighten the A3a role trigger's last-super-admin count.
-- ----------------------------------------------------------------------
-- enforce_user_role_change (0048) counted super_admins regardless of active
-- status. Now that is_active is load-bearing, a DEACTIVATED super_admin must not
-- count as a protector against demoting the last one — otherwise demoting the
-- only ACTIVE super_admin would be allowed while a deactivated super_admin
-- "covers" the count, leaving the org with zero usable super admins. The only
-- change vs 0048 is `and is_active` in the count and the matching message.

create or replace function public.enforce_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role             public.user_role;
  v_remaining_super_admins integer;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  v_actor_role := public.current_user_role();

  -- Rule 1 — only administrators may change any role (also closes the
  -- users_update_self self-escalation hole).
  if v_actor_role is null or v_actor_role = 'user' then
    raise exception using
      errcode = '42501',
      message = 'Only administrators can change a user role.';
  end if;

  -- Rule 2 — org_admin separation of duties: user <-> org_admin only.
  if v_actor_role = 'org_admin' then
    if new.role = 'super_admin' then
      raise exception using
        errcode = '42501',
        message = 'Only a super admin can grant the super admin role.';
    end if;
    if old.role = 'super_admin' then
      raise exception using
        errcode = '42501',
        message = 'Only a super admin can change a super admin''s role.';
    end if;
  end if;

  -- Rule 3 — last-ACTIVE-super-admin lockout protection (A3b coupling fix:
  -- `and is_active` added). A deactivated super_admin no longer counts.
  if old.role = 'super_admin' and new.role <> 'super_admin' then
    select count(*)
      into v_remaining_super_admins
      from public.users
     where organization_id = old.organization_id
       and role = 'super_admin'
       and is_active
       and id <> old.id;
    if v_remaining_super_admins = 0 then
      raise exception using
        errcode = '42501',
        message = 'Your organization must keep at least one active super admin.';
    end if;
  end if;

  insert into public.role_change_audit
    (organization_id, actor_user_id, target_user_id, old_role, new_role)
  values
    (old.organization_id, auth.uid(), old.id, old.role, new.role);

  return new;
end;
$$;

commit;


-- ============================================================================
-- Verification (run after applying):
--
--   -- Both triggers attached:
--   select tgname from pg_trigger where tgrelid = 'public.users'::regclass
--     and tgname in ('users_enforce_role_change', 'users_enforce_deactivation');
--
--   -- Audit table + RLS exist:
--   select relrowsecurity from pg_class where oid = 'public.user_status_audit'::regclass;  -- expect t
--
--   -- Deactivating the last active super_admin must fail (any actor):
--   -- update public.users set is_active = false where id = '<the only active super_admin>';
--   --   ERROR: Your organization must keep at least one active super admin.
--
--   -- As an org_admin session, deactivating a super_admin must fail:
--   -- update public.users set is_active = false where id = '<a super_admin>';
--   --   ERROR: Only a super admin can change a super admin's status.
--
--   -- A valid deactivation/reactivation writes exactly one audit row each:
--   -- update public.users set is_active = false where id = '<a user>';
--   -- update public.users set is_active = true  where id = '<that user>';
--   -- select * from public.user_status_audit order by created_at desc limit 2;
-- ============================================================================

-- ============================================================================
-- Reverse (only if needed):
--
--   begin;
--     drop trigger if exists users_enforce_deactivation on public.users;
--     drop function if exists public.enforce_user_deactivation();
--     drop table if exists public.user_status_audit;
--     -- Restore the 0048 role count (without `and is_active`) only if also
--     -- reverting A3b's request-layer block; otherwise leave the tightened
--     -- count in place (it is strictly more correct once is_active is used).
--   commit;
-- ============================================================================
