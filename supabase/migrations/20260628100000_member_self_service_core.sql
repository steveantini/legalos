-- ============================================================================
-- 20260628100000_member_self_service_core.sql
-- Policy & access arc, Phase C1 — member self-service SECURITY CORE, SHIPPING DARK.
-- ============================================================================
--
-- Builds the entire private-folder capability: a 'private' visibility tier,
-- owner-scoped RLS across the five Knowledge tables, a per-owner auto-folder
-- dedup, the toggle helper, and the SECURITY DEFINER sync materialization path.
--
-- DARK: organizations.member_self_service_folders defaults false, has NO UI and
-- NO action to flip it, and the Research/Structured Query "add folders"
-- affordance stays gated on isCurrentUserSuperAdmin in the page reads. So no
-- member can reach ANY of this in production until C2 (the toggle UI) ships and
-- an org opts in. The policies exist but are unreachable.
--
-- The real RLS proof is the adversarial suite supabase/tests/
-- phase_c1_member_self_service_rls.sql, run against a DB with this applied (a
-- Supabase branch). The vitest decision-table tests prove the LOGIC, not the SQL.
--
-- Owner identity: public.users.id IS auth.users.id, so the owner predicate is
-- created_by_user_id = auth.uid(). created_by_user_id is ON DELETE SET NULL, so a
-- deleted owner's private collections become owner-null (super_admin-only) — an
-- acceptable cleanup posture.
-- ============================================================================

-- 1. The 'private' visibility tier (additive; no private rows exist yet).
alter table public.collections drop constraint if exists collections_visibility_check;
alter table public.collections
  add constraint collections_visibility_check
  check (visibility in ('org', 'departments', 'private'));

-- 2. Per-owner dedup for PRIVATE auto-folder collections. owner_user_id is the
--    denormalized dedup scope: null for org auto-folders (one per folder
--    org-wide, unchanged), set for private (one per folder PER OWNER), so two
--    members privatizing the same drive folder get SEPARATE collections instead
--    of colliding on the old owner-blind unique index. Set once at create, never
--    reparented (same justification as the denormalized is_auto_folder).
alter table public.collection_sources
  add column if not exists owner_user_id uuid references public.users (id) on delete set null;

drop index if exists public.collection_sources_auto_folder_key;

create unique index if not exists collection_sources_auto_folder_org_key
  on public.collection_sources (connection_id, root_reference)
  where is_auto_folder and owner_user_id is null;

create unique index if not exists collection_sources_auto_folder_private_key
  on public.collection_sources (connection_id, root_reference, owner_user_id)
  where is_auto_folder and owner_user_id is not null;

-- 3. The org toggle, readable inside RLS (mirrors current_org_id()'s pattern:
--    SECURITY DEFINER, one PK lookup, STABLE so it's evaluated once per query).
create or replace function public.member_self_service_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select member_self_service_folders from public.organizations where id = public.current_org_id()),
    false
  );
$$;

-- ============================================================================
-- 4. RLS
-- ============================================================================

-- collections READ — RESTRUCTURE so org_admin's breadth EXCLUDES private. The
-- old policy granted org_admin read of ALL rows; private must be owner + super
-- admin only, so org_admin can NEVER see a member's private collection.
drop policy if exists collections_read_visible_in_org on public.collections;
create policy collections_read_visible_in_org
  on public.collections
  for select
  using (
    organization_id = public.current_org_id()
    and (
      public.current_user_role() = 'super_admin'
      or visibility = 'org'
      or (
        visibility = 'departments'
        and (
          public.current_user_role() = 'org_admin'
          or public.user_in_collection_departments(id)
        )
      )
      or (visibility = 'private' and created_by_user_id = auth.uid())
    )
  );

-- collections WRITE — the super_admin policy is UNCHANGED; add a SEPARATE
-- permissive member policy (Postgres ORs permissive policies). The WITH CHECK
-- confines every member-written row to private + self-owned + same org, so a
-- member can't create an 'org' row, set another owner, or UPDATE private -> org.
create policy collections_member_private_write
  on public.collections
  for all
  using (
    public.member_self_service_enabled()
    and organization_id = public.current_org_id()
    and visibility = 'private'
    and created_by_user_id = auth.uid()
  )
  with check (
    public.member_self_service_enabled()
    and organization_id = public.current_org_id()
    and visibility = 'private'
    and created_by_user_id = auth.uid()
  );

-- collection_sources — READ unchanged (composes via collections). Add a member
-- write policy for sources of the member's own private collection; WITH CHECK
-- additionally pins owner_user_id = auth.uid() (the dedup scope).
create policy collection_sources_member_private_write
  on public.collection_sources
  for all
  using (
    public.member_self_service_enabled()
    and exists (
      select 1 from public.collections c
      where c.id = collection_sources.collection_id
        and c.visibility = 'private'
        and c.created_by_user_id = auth.uid()
    )
  )
  with check (
    public.member_self_service_enabled()
    and owner_user_id = auth.uid()
    and exists (
      select 1 from public.collections c
      where c.id = collection_sources.collection_id
        and c.visibility = 'private'
        and c.created_by_user_id = auth.uid()
    )
  );

-- collection_documents — READ unchanged (composes). WRITE stays super_admin-only;
-- member-private inventory is materialized through the SECURITY DEFINER path
-- below, NOT a broad member RLS branch.

-- collection_schemas — READ unchanged (composes via schema_id -> collections, so
-- a member's private schema flows automatically and another member's stays
-- hidden). Add a member write policy keyed on the schema's OWN created_by_user_id
-- (the insert chicken-and-egg fix: at insert the collection's schema_id pointer
-- isn't set yet, but the member owns the schema entity they create).
create policy collection_schemas_member_private_write
  on public.collection_schemas
  for all
  using (
    public.member_self_service_enabled()
    and organization_id = public.current_org_id()
    and created_by_user_id = auth.uid()
  )
  with check (
    public.member_self_service_enabled()
    and organization_id = public.current_org_id()
    and created_by_user_id = auth.uid()
  );

-- documents (the anchor) — READ: add a member branch so the owner can read the
-- anchors of docs in their OWN private collection (needed for prepare/query
-- joins); the bare anchor row reveals no collection membership. WRITE stays
-- super_admin-only (no owner column on the shared anchor; member writes go only
-- through the definer). Add as a SEPARATE permissive read policy (ORs in).
create policy documents_member_private_read
  on public.documents
  for select
  using (
    exists (
      select 1
      from public.collection_documents cd
      join public.collections c on c.id = cd.collection_id
      where cd.document_id = documents.id
        and c.visibility = 'private'
        and c.created_by_user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. The SECURITY DEFINER sync path — the safe anchor/inventory write.
-- Called by the member's AUTHENTICATED client (auth.uid() = the member), each
-- function RAISEs unless the caller owns the target private collection AND the
-- toggle is on, and DERIVES org / validates connection+source against that
-- collection so a member can NEVER write an arbitrary anchor row.
-- ============================================================================

create or replace function public.member_can_manage_collection(p_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_self_service_enabled() and exists (
    select 1 from public.collections c
    where c.id = p_collection_id
      and c.visibility = 'private'
      and c.created_by_user_id = auth.uid()
  );
$$;

-- Upsert canonical anchors for a private collection's enumerated files. org is
-- DERIVED from the collection (never the caller's rows); connection_id must back
-- a source of this collection. Returns external_id -> id for inventory linking.
create or replace function public.sync_upsert_private_anchors(
  p_collection_id uuid,
  p_rows jsonb
)
returns table (id uuid, external_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not public.member_can_manage_collection(p_collection_id) then
    raise exception 'not authorized to materialize documents for collection %', p_collection_id;
  end if;
  select organization_id into v_org from public.collections where id = p_collection_id;

  return query
  insert into public.documents as d (
    organization_id, connection_id, external_id, title, mime_type,
    size_bytes, modified_at_source, source_url, last_seen_at
  )
  select
    v_org, r.connection_id, r.external_id, r.title, r.mime_type,
    r.size_bytes, r.modified_at_source, r.source_url, r.last_seen_at
  from jsonb_to_recordset(p_rows) as r (
    connection_id uuid, external_id text, title text, mime_type text,
    size_bytes bigint, modified_at_source timestamptz, source_url text, last_seen_at timestamptz
  )
  where r.connection_id in (
    select connection_id from public.collection_sources where collection_id = p_collection_id
  )
  on conflict (organization_id, connection_id, external_id) do update set
    title = excluded.title,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes,
    modified_at_source = excluded.modified_at_source,
    source_url = excluded.source_url,
    last_seen_at = excluded.last_seen_at,
    updated_at = now()
  returning d.id, d.external_id;
end;
$$;

-- Upsert inventory rows for a private collection; collection_id is FORCED to the
-- owned collection and each source must belong to it.
create or replace function public.sync_upsert_private_inventory(
  p_collection_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.member_can_manage_collection(p_collection_id) then
    raise exception 'not authorized to materialize inventory for collection %', p_collection_id;
  end if;

  insert into public.collection_documents as cd (
    collection_id, collection_source_id, external_id, title, mime_type,
    size_bytes, modified_at_source, source_url, last_seen_at, status, document_id
  )
  select
    p_collection_id, r.collection_source_id, r.external_id, r.title, r.mime_type,
    r.size_bytes, r.modified_at_source, r.source_url, r.last_seen_at,
    coalesce(r.status, 'present'), r.document_id
  from jsonb_to_recordset(p_rows) as r (
    collection_source_id uuid, external_id text, title text, mime_type text,
    size_bytes bigint, modified_at_source timestamptz, source_url text,
    last_seen_at timestamptz, status text, document_id uuid
  )
  where r.collection_source_id in (
    select id from public.collection_sources where collection_id = p_collection_id
  )
  on conflict (collection_source_id, external_id) do update set
    title = excluded.title,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes,
    modified_at_source = excluded.modified_at_source,
    source_url = excluded.source_url,
    last_seen_at = excluded.last_seen_at,
    status = excluded.status,
    document_id = excluded.document_id;
end;
$$;

-- Mark a private source's unseen inventory missing after a completed walk.
create or replace function public.sync_finalize_private_source(
  p_collection_id uuid,
  p_source_id uuid,
  p_watermark timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.member_can_manage_collection(p_collection_id) then
    raise exception 'not authorized to finalize collection %', p_collection_id;
  end if;
  if not exists (
    select 1 from public.collection_sources
    where id = p_source_id and collection_id = p_collection_id
  ) then
    raise exception 'source % does not belong to collection %', p_source_id, p_collection_id;
  end if;

  update public.collection_documents
    set status = 'missing'
  where collection_source_id = p_source_id
    and status = 'present'
    and last_seen_at < p_watermark;
end;
$$;

grant execute on function public.member_self_service_enabled() to authenticated;
grant execute on function public.member_can_manage_collection(uuid) to authenticated;
grant execute on function public.sync_upsert_private_anchors(uuid, jsonb) to authenticated;
grant execute on function public.sync_upsert_private_inventory(uuid, jsonb) to authenticated;
grant execute on function public.sync_finalize_private_source(uuid, uuid, timestamptz) to authenticated;

-- ============================================================================
-- Verification (run after applying; the real proof is the adversarial SQL suite)
-- ============================================================================
-- 1. private tier accepted:
--    select pg_get_constraintdef(oid) from pg_constraint where conname='collections_visibility_check';
--    -- expect: CHECK ((visibility = ANY (ARRAY['org','departments','private'])))
-- 2. the two partial uniques exist:
--    select indexname from pg_indexes where tablename='collection_sources'
--      and indexname in ('collection_sources_auto_folder_org_key','collection_sources_auto_folder_private_key');
--    -- expect: 2 rows; the old collection_sources_auto_folder_key is gone.
-- 3. the member policies exist:
--    select tablename, policyname from pg_policies where policyname like '%member_private%';
--    -- expect: collections / collection_sources / collection_schemas write + documents read.
-- 4. toggle still off everywhere (dark):
--    select count(*) from public.organizations where member_self_service_folders; -- expect 0.
