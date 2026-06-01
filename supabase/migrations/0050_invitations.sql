-- ============================================================================
-- 0050_invitations.sql
-- Admin milestone A3c (People) — invitations + invite-aware provisioning
-- ============================================================================
--
-- A3c completes People: an admin invites a person by email with a chosen org
-- role and department access. The invite email is sent through Supabase's auth
-- email (the service-role auth.admin.inviteUserByEmail), so there is no new
-- email infrastructure. Acceptance is SEAMLESS: when the invited person clicks
-- the link and signs in, ensure_user_provisioned() consumes their pending
-- invitation, provisioning them with the chosen role + departments and marking
-- the invite accepted, with no separate accept step.
--
-- This migration adds:
--   1. public.invitations — one row per invite (email, chosen role, chosen
--      departments, inviter, status, expiry). A partial unique index allows at
--      most one PENDING invite per email per org. RLS mirrors the People model:
--      org/super admins read+write their org's invites.
--   2. enforce_invitation_role — a BEFORE INSERT/UPDATE-OF-role trigger that is
--      the DB backstop for the escalation rule: an org_admin can never create or
--      retarget an invitation to super_admin. This matters because the chosen
--      role becomes users.role at acceptance via an INSERT, and the role trigger
--      (0048) only guards UPDATE OF role — so invite-role escalation must be
--      stopped at invite creation. The server action enforces the same rule for
--      friendly errors; this trigger is the authoritative guard.
--   3. ensure_user_provisioned() extended to consume a pending, non-expired
--      invitation matching the new user's email: provision the invite's role +
--      departments instead of the hardcoded 'user' + org defaults, and mark the
--      invite accepted. Falls back to today's exact behavior when no invite.
--
-- The gate (lib/auth/allowlist.ts) becomes DB-backed (admit invited OR existing
-- user, plus the env list as a transitional safety hatch) — that is app code,
-- not part of this migration, but it reads this table.
--
-- APPLY ORDERING (important). Apply this migration BEFORE using the invite UI.
-- The People roster/roles/deactivation/defaults work without it. The async gate
-- in app code tolerates this table being absent (it treats a missing table as
-- "no invitation" and still admits existing users), so deploying the app before
-- applying this migration never locks out the owner — it just can't send invites
-- until the table exists.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- Idempotent: create-type-if-not-exists guard, create-table-if-not-exists,
-- create-or-replace function, drop-trigger-if-exists before create.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------
-- 1. Table: invitations
-- ----------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invitation_status') then
    create type public.invitation_status as enum
      ('pending', 'accepted', 'revoked', 'expired');
  end if;
end $$;

create table if not exists public.invitations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  email               text not null,                       -- stored lowercased by the app
  role                public.user_role not null,
  department_ids      uuid[] not null default '{}',        -- chosen department access; granted at role='user' on acceptance
  invited_by_user_id  uuid references public.users (id) on delete set null,  -- nullable so deleting the inviter keeps the invite/audit trail
  auth_user_id        uuid,                                -- the Supabase auth user created by inviteUserByEmail (for clean re-invite on revoke); no FK to auth.users by design
  status              public.invitation_status not null default 'pending',
  expires_at          timestamptz not null,
  accepted_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- At most one PENDING invite per email per org. Revoked/accepted/expired rows
-- don't count, so an email can be re-invited after revoke or expiry.
create unique index if not exists invitations_one_pending_per_email
  on public.invitations (organization_id, lower(email))
  where status = 'pending';

create index if not exists invitations_org_status_idx
  on public.invitations (organization_id, status);
create index if not exists invitations_email_idx
  on public.invitations (lower(email));

create trigger invitations_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

alter table public.invitations enable row level security;

-- Read + write: org/super admins of the org. Mirror-RLS — the app action gates
-- the escalation rule (who may invite which role); RLS gives the coarse
-- admins-of-this-org gate, and the trigger below enforces the role-value rule.
drop policy if exists invitations_admin_read on public.invitations;
create policy invitations_admin_read
  on public.invitations
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );

drop policy if exists invitations_admin_write on public.invitations;
create policy invitations_admin_write
  on public.invitations
  for all
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ----------------------------------------------------------------------
-- 2. Trigger function: enforce_invitation_role
-- ----------------------------------------------------------------------
-- The escalation backstop at invite creation. An org_admin may invite at
-- user/org_admin only; only a super_admin may invite a super_admin. SECURITY
-- DEFINER so current_user_role() resolves the actor regardless of RLS. Fires on
-- INSERT and on any UPDATE that changes role (revoke/resend change status/expiry,
-- not role, so they don't trip it).

create or replace function public.enforce_invitation_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role public.user_role;
begin
  v_actor_role := public.current_user_role();

  if v_actor_role is null or v_actor_role = 'user' then
    raise exception using
      errcode = '42501',
      message = 'Only administrators can manage invitations.';
  end if;

  if v_actor_role = 'org_admin' and new.role = 'super_admin' then
    raise exception using
      errcode = '42501',
      message = 'Only a super admin can invite a super admin.';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_invitation_role() from public;

drop trigger if exists invitations_enforce_role on public.invitations;
create trigger invitations_enforce_role
  before insert or update of role on public.invitations
  for each row
  execute function public.enforce_invitation_role();


-- ----------------------------------------------------------------------
-- 3. ensure_user_provisioned() — consume a pending invitation on first sign-in.
-- ----------------------------------------------------------------------
-- Extends 0002/0021. On first provisioning, look up a pending non-expired invite
-- for the new user's email in the org. If found, provision the invite's role and
-- departments and mark it accepted; otherwise fall back to role='user' + the org
-- default departments exactly as before. An accepted invite suppresses the
-- default-departments stage entirely (so an invite with NO departments yields no
-- departments, not the org defaults). Idempotent; SECURITY DEFINER.

create or replace function public.ensure_user_provisioned()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id          uuid;
  v_grant_count     integer;
  v_email           text;
  v_invite_id       uuid;
  v_invite_role     public.user_role;
  v_invite_depts    uuid[];
  v_invite_consumed boolean := false;
begin
  -- --------------------------------------------------------------------
  -- Stage 1: ensure public.users row exists; consume an invite if present.
  -- --------------------------------------------------------------------
  if not exists (select 1 from public.users where id = auth.uid()) then
    select id
      into v_org_id
      from public.organizations
      order by created_at asc
      limit 1;

    if v_org_id is null then
      return;  -- seed not run yet
    end if;

    select coalesce(u.email, '')
      into v_email
      from auth.users u
      where u.id = auth.uid();

    -- Most recent pending, non-expired invite for this email in the org.
    select inv.id, inv.role, inv.department_ids
      into v_invite_id, v_invite_role, v_invite_depts
      from public.invitations inv
      where inv.organization_id = v_org_id
        and lower(inv.email) = lower(v_email)
        and inv.status = 'pending'
        and inv.expires_at > now()
      order by inv.created_at desc
      limit 1;

    -- Provision with the invite's role when present, else 'user'.
    insert into public.users (id, organization_id, email, role, is_active)
    values (auth.uid(), v_org_id, v_email, coalesce(v_invite_role, 'user'), true)
    on conflict (id) do nothing;

    if v_invite_id is not null then
      -- Apply the invite's chosen departments (at role='user', consistent with
      -- the access model). Best-effort: a departments failure must not block.
      begin
        insert into public.user_department_roles (user_id, department_id, role)
        select auth.uid(), dept_id, 'user'
          from unnest(v_invite_depts) as dept_id
        on conflict (user_id, department_id) do nothing;
      exception when others then
        null;
      end;

      update public.invitations
         set status = 'accepted', accepted_at = now()
       where id = v_invite_id;

      v_invite_consumed := true;
    end if;
  end if;

  -- --------------------------------------------------------------------
  -- Stage 2: org default departments — ONLY when no invite was consumed.
  -- An accepted invite is authoritative about department access (including the
  -- deliberate "no departments" choice), so defaults never override it.
  -- --------------------------------------------------------------------
  if not v_invite_consumed then
    select count(*)
      into v_grant_count
      from public.user_department_roles
      where user_id = auth.uid();

    if v_grant_count = 0 then
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
        null;
      end;
    end if;
  end if;
end;
$$;

-- Privilege grants from 0002 (revoke from public + grant to authenticated)
-- persist across CREATE OR REPLACE; no need to re-issue.

commit;


-- ============================================================================
-- Verification (run after applying):
--
--   -- Table + partial unique index + RLS exist:
--   select relrowsecurity from pg_class where oid = 'public.invitations'::regclass;  -- expect t
--   select indexname from pg_indexes where tablename = 'invitations';
--
--   -- An org_admin session cannot create a super_admin invite (trigger):
--   -- insert into public.invitations (organization_id, email, role, expires_at)
--   --   values (public.current_org_id(), 'x@example.com', 'super_admin', now() + interval '7 days');
--   --   ERROR: Only a super admin can invite a super admin.
--
--   -- Provisioning consumes a pending invite: insert a pending invite for an
--   -- email, sign in as that user, then confirm the users row has the invite's
--   -- role, the chosen departments are granted, and the invite is 'accepted':
--   -- select role from public.users where email = lower('<invited email>');
--   -- select status, accepted_at from public.invitations where lower(email) = lower('<invited email>');
-- ============================================================================

-- ============================================================================
-- Reverse (only if needed):
--
--   begin;
--     -- Restore the 0021 provisioning function (no invite stage) — see 0021.
--     drop trigger if exists invitations_enforce_role on public.invitations;
--     drop function if exists public.enforce_invitation_role();
--     drop table if exists public.invitations;
--     drop type if exists public.invitation_status;
--   commit;
-- ============================================================================
