-- ============================================================================
-- 0002_user_provisioning.sql
-- ============================================================================
-- Adds `ensure_user_provisioned()` — called by the Next.js proxy
-- (`proxy.ts`) on every authenticated request. Inserts a `public.users`
-- row for the current auth
-- user if one does not exist, linking them to the single organization with
-- role='user'. No-op if already provisioned or if no organization exists yet
-- (seed has not been run).
--
-- SECURITY DEFINER with explicit `search_path` per supabase.md gotcha #3
-- (prevents injection via mutable search_path). Execute is granted only to
-- the `authenticated` role; `anon` cannot call this.
-- ============================================================================

create or replace function public.ensure_user_provisioned()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
begin
  -- Idempotent: no-op if the user is already provisioned.
  if exists (select 1 from public.users where id = auth.uid()) then
    return;
  end if;

  -- Find the (single-tenant) organization. If none exists yet (seed has not
  -- been run), silently return — the seed script will create the user row
  -- when it runs.
  select id
    into v_org_id
    from public.organizations
    order by created_at asc
    limit 1;

  if v_org_id is null then
    return;
  end if;

  -- Provision with role='user'. org_admin promotion is a deliberate operation
  -- handled by the seed script (first install) or by the org_admin management
  -- UI (Phase 5).
  insert into public.users (id, organization_id, email, role, is_active)
  select auth.uid(), v_org_id, coalesce(u.email, ''), 'user', true
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;
end;
$$;

revoke execute on function public.ensure_user_provisioned() from public;
grant execute on function public.ensure_user_provisioned() to authenticated;
