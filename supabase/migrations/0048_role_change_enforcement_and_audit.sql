-- ============================================================================
-- 0048_role_change_enforcement_and_audit.sql
-- Admin milestone A3a (People) — role-escalation enforcement + role-change audit
-- ============================================================================
--
-- A3a adds an in-product editor for a user's ORG role (users.role). Before this,
-- role changes were SQL-only and the role-mutation RLS was wide open: the
-- migration-0001 policy `users_org_admin_manage` is FOR ALL with no column or
-- value guard, so any org_admin could set ANY user's role to ANYTHING — granting
-- super_admin to others, or demoting a super_admin. There is also a quieter hole:
-- `users_update_self` lets a user update their own row with no role guard, so a
-- plain user could set their own role. These are latent only because no UI wrote
-- the role column; the editor makes them live. This migration closes them.
--
-- Why a trigger, not pure RLS. The escalation rule is value-comparison logic:
-- it depends on the actor's role, OLD.role, NEW.role, AND a cross-row count (the
-- last-super-admin guard). RLS WITH CHECK sees only NEW and cannot compare it to
-- OLD or count siblings. A BEFORE UPDATE trigger is the correct tool — it sees
-- OLD and NEW and can query the table. We KEEP `users_org_admin_manage` (and
-- `users_update_self`) as the coarse WHO-may-write-this-row gate, and add the
-- trigger as the fine-grained role-transition guard. The trigger is the single
-- authoritative enforcement point for the escalation rule; the server action
-- mirrors it for friendly errors (defense in depth, D-041 mirror-RLS).
--
-- The rule (locked):
--   * super_admin may set any user to any role.
--   * org_admin may manage user <-> org_admin ONLY; may NOT grant super_admin and
--     may NOT modify a user who is currently super_admin (no escalation above
--     one's own tier; no modifying a peer-or-higher top-tier user).
--   * The org's LAST super_admin cannot be demoted (lockout protection), enforced
--     for every actor including a super_admin demoting themselves.
--   * (Self-demotion confirmation is a UI concern; the DB only enforces the
--     last-super-admin guard.)
--
-- Audit. Every committed role change is recorded to public.role_change_audit by
-- the trigger itself (not the server action), so the trail captures EVERY change
-- — including direct SQL — exactly once. The trigger is SECURITY DEFINER, so its
-- audit INSERT bypasses the table's RLS; no INSERT policy is granted to app roles
-- (the table is append-only from the application's point of view). The audit-log
-- viewer UI is a later milestone (A6); recording starts now because role changes
-- are the highest-stakes mutation.
--
-- APPLY ORDERING (important). Apply this migration BEFORE the People role editor
-- is used. The roster, department-access, and default-departments parts of People
-- work without it, but the role editor's safety depends on this trigger: until it
-- is applied, the old unguarded RLS is still the only server-side gate. The server
-- action also enforces the rule, but the database trigger is the guarantee against
-- a crafted request. Recommended sequence: apply this migration, then use the role
-- editor.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- Idempotent: create-table-if-not-exists, create-or-replace function, and
-- drop-trigger-if-exists before create.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------
-- 1. Table: role_change_audit
-- ----------------------------------------------------------------------
-- One row per committed org-role change. FK references are nullable with
-- ON DELETE SET NULL (mirroring the connector arc's audit-FK pattern and
-- agents.created_by) so deprovisioning a user never destroys the audit trail —
-- the row survives with a null actor/target. organization_id cascades since an
-- org's audit has no meaning without the org (single-tenant today).

create table if not exists public.role_change_audit (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations (id) on delete cascade,
  actor_user_id    uuid references public.users (id) on delete set null,  -- who made the change; null if SQL/console or actor later deleted
  target_user_id   uuid references public.users (id) on delete set null,  -- whose role changed; null if later deleted
  old_role         public.user_role not null,
  new_role         public.user_role not null,
  created_at       timestamptz not null default now()
);

create index if not exists role_change_audit_org_id_idx
  on public.role_change_audit (organization_id);
create index if not exists role_change_audit_target_user_id_idx
  on public.role_change_audit (target_user_id);
create index if not exists role_change_audit_created_at_idx
  on public.role_change_audit (created_at desc);

alter table public.role_change_audit enable row level security;

-- Read: org/super admins read their own org's audit rows. No INSERT/UPDATE/DELETE
-- policy by design — the SECURITY DEFINER trigger is the only writer, and the
-- table is append-only from the application's point of view.
drop policy if exists role_change_audit_admin_read on public.role_change_audit;
create policy role_change_audit_admin_read
  on public.role_change_audit
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ----------------------------------------------------------------------
-- 2. Trigger function: enforce_user_role_change
-- ----------------------------------------------------------------------
-- BEFORE UPDATE OF role on public.users. Validates the transition against the
-- escalation rule and the last-super-admin guard, then records the audit row.
-- SECURITY DEFINER so the sibling-count query and the audit INSERT bypass RLS
-- and are accurate/authorized regardless of the invoking user's policies.
-- current_user_role() and auth.uid() still resolve to the actual actor.

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
  -- Act only when role actually changes. Profile updates (full_name) and
  -- is_active changes (A3b) pass through untouched even though the trigger is
  -- scoped to `OF role`, because an UPDATE listing role with an unchanged value
  -- would otherwise reach here.
  if new.role is not distinct from old.role then
    return new;
  end if;

  v_actor_role := public.current_user_role();

  -- Rule 1 — only administrators may change any role. This also closes the
  -- self-update hole: `users_update_self` lets a user update their own row, but
  -- a non-admin (or unauthenticated) actor changing role is rejected here.
  if v_actor_role is null or v_actor_role = 'user' then
    raise exception using
      errcode = '42501',
      message = 'Only administrators can change a user role.';
  end if;

  -- Rule 2 — org_admin separation of duties: may manage user <-> org_admin only.
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

  -- Rule 3 — last-super-admin lockout protection. A demotion away from
  -- super_admin is refused when this is the org's only remaining super_admin.
  -- Applies to every actor, including a super_admin demoting themselves.
  if old.role = 'super_admin' and new.role <> 'super_admin' then
    select count(*)
      into v_remaining_super_admins
      from public.users
     where organization_id = old.organization_id
       and role = 'super_admin'
       and id <> old.id;
    if v_remaining_super_admins = 0 then
      raise exception using
        errcode = '42501',
        message = 'Your organization must keep at least one super admin.';
    end if;
  end if;

  -- Passed every guard — record the change (append-only). Written here so every
  -- committed role change is captured exactly once, including direct SQL.
  insert into public.role_change_audit
    (organization_id, actor_user_id, target_user_id, old_role, new_role)
  values
    (old.organization_id, auth.uid(), old.id, old.role, new.role);

  return new;
end;
$$;

-- Lock down execute: the trigger fires automatically; no role needs to call it.
revoke execute on function public.enforce_user_role_change() from public;

drop trigger if exists users_enforce_role_change on public.users;
create trigger users_enforce_role_change
  before update of role on public.users
  for each row
  execute function public.enforce_user_role_change();

commit;


-- ============================================================================
-- Verification (run after applying):
--
--   -- Trigger is attached:
--   select tgname from pg_trigger where tgrelid = 'public.users'::regclass
--     and tgname = 'users_enforce_role_change';
--
--   -- Audit table + RLS exist:
--   select relrowsecurity from pg_class where oid = 'public.role_change_audit'::regclass;  -- expect t
--
--   -- As an org_admin session, attempting to grant super_admin must fail:
--   -- update public.users set role = 'super_admin' where id = '<some user>';
--   --   ERROR: Only a super admin can grant the super admin role.
--
--   -- Demoting the last super_admin must fail (any actor):
--   -- update public.users set role = 'user' where id = '<the only super_admin>';
--   --   ERROR: Your organization must keep at least one super admin.
--
--   -- A valid change writes exactly one audit row:
--   -- update public.users set role = 'org_admin' where id = '<a user>';
--   -- select * from public.role_change_audit order by created_at desc limit 1;
-- ============================================================================

-- ============================================================================
-- Reverse (only if needed):
--
--   begin;
--     drop trigger if exists users_enforce_role_change on public.users;
--     drop function if exists public.enforce_user_role_change();
--     drop table if exists public.role_change_audit;
--   commit;
--
--   Reversing restores the pre-A3a state, including the unguarded role-mutation
--   path — do not reverse while the People role editor is in use.
-- ============================================================================
