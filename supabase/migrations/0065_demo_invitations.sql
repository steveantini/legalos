-- ============================================================================
-- 0065_demo_invitations.sql
-- Demo access Step 2 — single-use demo access tokens + reusable structure seed
-- ============================================================================
--
-- Two additive pieces, both building on Step 1 (0064 is_demo + the seeded Demo
-- Org):
--
--   1. demo_invitations — single-use tokens for the /demo/<token> access link.
--      We store a SHA-256 HASH of the token, never the raw token, so a database
--      read can never reveal a working link. The /demo route consumes a token
--      server-side with the service-role key (no email is ever sent — the
--      D-049 synthetic-user + server-side magic-link trick). RLS mirrors
--      invitations (0050): only a super_admin / org_admin of the org may read
--      or write rows; the service-role consume path bypasses RLS.
--
--   2. seed_demo_org_structure(p_demo_org_id) — a SECURITY DEFINER function that
--      re-mirrors the real org's departments + agents into a demo org. It is
--      the exact Step-1 copy logic (supabase/seed/demo-org.sql), made callable
--      so the Step-2 reset script can restore structure without re-implementing
--      the INSERT…SELECT in TypeScript. It GUARDS its target: it refuses to run
--      unless p_demo_org_id is an is_demo = true org, it only READS the real org
--      (oldest is_demo = false), and it only WRITES the demo org id passed in.
--
-- DEPLOY ORDERING: requires 0064 (organizations.is_demo) and the Step-1 seed
-- (a Demo Org must exist before a token can point at it / a reset can run).
-- Apply in the Supabase SQL Editor, the project's standard path.
-- ============================================================================


-- ============================================================================
-- Table: demo_invitations
-- ============================================================================

create table if not exists public.demo_invitations (
  id                    uuid primary key default gen_random_uuid(),
  -- SHA-256 hex of the raw token. The raw token is shown ONCE at generation and
  -- never stored, so a DB read cannot reconstruct a usable /demo link.
  token_hash            text not null unique,
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  status                text not null default 'pending'
                          check (status in ('pending', 'consumed', 'revoked')),
  created_by_user_id    uuid references public.users (id) on delete set null,
  -- The synthetic demo user this token created, recorded after a successful
  -- consume. Null while pending.
  consumed_by_user_id   uuid references public.users (id) on delete set null,
  consumed_at           timestamptz,
  -- A generous default expiry so a forgotten link eventually lapses. There is
  -- no cleanup cron (deferred, per the per-session-isolation future); demo
  -- tokens simply stop working after this, and resets/revokes are manual.
  expires_at            timestamptz not null default (now() + interval '30 days'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists demo_invitations_organization_id_idx
  on public.demo_invitations (organization_id);

create trigger demo_invitations_updated_at
  before update on public.demo_invitations
  for each row execute function public.set_updated_at();

alter table public.demo_invitations enable row level security;

-- RLS mirrors invitations (0050): org admins of the org read/write; everyone
-- else is denied. The /demo consume path and the mint/reset scripts use the
-- service-role key, which bypasses RLS entirely — these policies govern only
-- any future in-app (anon/authenticated) access, e.g. a demo-token admin UI.
drop policy if exists demo_invitations_admin_read on public.demo_invitations;
create policy demo_invitations_admin_read
  on public.demo_invitations
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );

drop policy if exists demo_invitations_admin_write on public.demo_invitations;
create policy demo_invitations_admin_write
  on public.demo_invitations
  for all
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- Function: seed_demo_org_structure(p_demo_org_id)
-- ============================================================================
-- Re-mirrors the real org's departments + agents into the given demo org. This
-- is the Step-1 seed's copy logic (supabase/seed/demo-org.sql), made reusable
-- for the Step-2 reset. SECURITY DEFINER so the reset script (service-role) and
-- a future caller share one guarded implementation.
--
-- SAFETY: like the seed, this is one-directional. It refuses unless the target
-- is an is_demo = true org, it only READS the real org (oldest is_demo = false),
-- it asserts target <> real org, and every write is bound to p_demo_org_id.

create or replace function public.seed_demo_org_structure(p_demo_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_real_org_id   uuid;
  v_target_demo   boolean;
begin
  -- Guard 1: the target must be a demo org. Refuse otherwise.
  select is_demo into v_target_demo
    from public.organizations
   where id = p_demo_org_id;

  if v_target_demo is null then
    raise exception 'seed_demo_org_structure: org % not found.', p_demo_org_id;
  end if;
  if v_target_demo is distinct from true then
    raise exception
      'seed_demo_org_structure: refusing — org % is not a demo org (is_demo is not true).',
      p_demo_org_id;
  end if;

  -- Resolve the real org (oldest is_demo = false). READ-ONLY.
  select id into v_real_org_id
    from public.organizations
   where is_demo = false
   order by created_at asc
   limit 1;

  if v_real_org_id is null then
    raise exception 'seed_demo_org_structure: no real (is_demo = false) org to mirror.';
  end if;

  -- Guard 2: never let the target equal the real org.
  if p_demo_org_id = v_real_org_id then
    raise exception
      'seed_demo_org_structure: refusing — target equals the real org id (%).',
      v_real_org_id;
  end if;

  -- Mirror departments (active only). Writes only p_demo_org_id.
  insert into public.departments
    (organization_id, slug, name, description, sort_order, is_active)
  select
    p_demo_org_id, d.slug, d.name, d.description, d.sort_order, d.is_active
  from public.departments d
  where d.organization_id = v_real_org_id
    and d.deleted_at is null
  on conflict (organization_id, slug) do update set
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

  -- Mirror agents (non-deleted), department remapped by slug. created_by and
  -- forked_from_agent_id nulled so no demo row points at the real org.
  insert into public.agents
    (organization_id, department_id, slug, name, description, type,
     external_url, system_prompt, model, sort_order, is_active, category,
     is_template, forked_from_agent_id, tools_enabled, default_output_format,
     source_origin, created_by)
  select
    p_demo_org_id, dd.id, a.slug, a.name, a.description, a.type,
    a.external_url, a.system_prompt, a.model, a.sort_order, a.is_active, a.category,
    a.is_template, null, a.tools_enabled, a.default_output_format,
    a.source_origin, null
  from public.agents a
  join public.departments rd
    on rd.id = a.department_id
   and rd.organization_id = v_real_org_id
  join public.departments dd
    on dd.slug = rd.slug
   and dd.organization_id = p_demo_org_id
   and dd.deleted_at is null
  where a.organization_id = v_real_org_id
    and a.deleted_at is null
  on conflict (organization_id, slug) do update set
    department_id = excluded.department_id,
    name = excluded.name,
    description = excluded.description,
    type = excluded.type,
    external_url = excluded.external_url,
    system_prompt = excluded.system_prompt,
    model = excluded.model,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    category = excluded.category,
    is_template = excluded.is_template,
    tools_enabled = excluded.tools_enabled,
    default_output_format = excluded.default_output_format,
    source_origin = excluded.source_origin;
end $$;

comment on function public.seed_demo_org_structure(uuid) is
  'Re-mirrors the real org''s active departments + non-deleted agents into the given demo org (Step-1 copy logic, reused by the Step-2 reset). Guarded: refuses unless the target is is_demo = true and not the real org; reads only the real org; writes only the target.';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- Table shape + unique hash
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'demo_invitations' order by ordinal_position;
--
--   -- RLS policies present (mirror invitations)
--   select polname from pg_policy
--   where polrelid = 'public.demo_invitations'::regclass order by polname;
--   -- expect: demo_invitations_admin_read, demo_invitations_admin_write
--
--   -- Function exists
--   select proname, prosecdef from pg_proc where proname = 'seed_demo_org_structure';
--   -- expect: one row, prosecdef = t (security definer)
--
--   -- The function refuses a non-demo org (run against the real org id — expect an error):
--   -- select public.seed_demo_org_structure('<real-org-id>');  -- raises "refusing — not a demo org"
-- ============================================================================
