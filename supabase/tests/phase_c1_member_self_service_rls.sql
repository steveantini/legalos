-- ============================================================================
-- phase_c1_member_self_service_rls.sql
-- The ADVERSARIAL RLS proof for Phase C1 (member self-service security core).
--
-- This is the AUTHORITATIVE proof (the vitest decision-table only proves logic).
-- Run it against a database with migration 20260628100000 applied (a Supabase
-- branch). It creates its own fixtures, impersonates each user via
-- request.jwt.claims + `set local role authenticated`, asserts every expected
-- allow/deny, and ROLLS BACK at the end so nothing persists.
--
-- Run:  psql "$BRANCH_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_c1_member_self_service_rls.sql
-- A failed assertion RAISEs and (with ON_ERROR_STOP) aborts; success prints
-- "ALL PHASE C1 RLS ASSERTIONS PASSED" just before the rollback.
--
-- Cast: A, B = members of org1; OA = org_admin (org1); SA = super_admin (org1);
-- C = member of org2.
-- ============================================================================

begin;

-- Fixed ids (readable, distinct).
\set org1   '''11111111-1111-1111-1111-111111111111'''
\set org2   '''22222222-2222-2222-2222-222222222222'''
\set uA     '''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'''
\set uB     '''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'''
\set uOA    '''00000000-0000-0000-0000-0000000000aa'''
\set uSA    '''00000000-0000-0000-0000-0000000000ff'''
\set uC     '''cccccccc-cccc-cccc-cccc-cccccccccccc'''
\set connX  '''dddddddd-dddd-dddd-dddd-dddddddddddd'''
\set colAP  '''eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'''
\set colOrg '''e0ffffff-ffff-ffff-ffff-ffffffff0001'''
\set schemaA '''e0ffffff-ffff-ffff-ffff-ffffffff0003'''
\set docA   '''e0ffffff-ffff-ffff-ffff-ffffffff0004'''

-- ---------------------------------------------------------------------------
-- Setup (as the connecting superuser/owner, which bypasses RLS).
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  (:uA,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local', now(), now()),
  (:uB,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local', now(), now()),
  (:uOA, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','oa@test.local', now(), now()),
  (:uSA, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','sa@test.local', now(), now()),
  (:uC,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@test.local', now(), now());

insert into public.organizations (id, name, slug, member_self_service_folders)
values (:org1, 'Org One', 'org-one-c1test', true),
       (:org2, 'Org Two', 'org-two-c1test', true);

insert into public.users (id, organization_id, email, role)
values
  (:uA,  :org1, 'a@test.local',  'user'),
  (:uB,  :org1, 'b@test.local',  'user'),
  (:uOA, :org1, 'oa@test.local', 'org_admin'),
  (:uSA, :org1, 'sa@test.local', 'super_admin'),
  (:uC,  :org2, 'c@test.local',  'user');

-- A's private folder-backed collection + its owned auto-folder source over
-- (connX, rootF), plus an org-wide collection, an anchor doc in A's private
-- collection, and a schema A owns pointed at by A's private collection.
insert into public.collections (id, organization_id, name, description, visibility, created_by_user_id, is_auto_folder, schema_id)
values
  (:colAP,  :org1, 'A private', '', 'private', :uA, true, :schemaA),
  (:colOrg, :org1, 'Org wide',  '', 'org',     :uSA, false, null);

insert into public.collection_schemas (id, organization_id, name, attributes, created_by_user_id)
values (:schemaA, :org1, 'A kind', '[]'::jsonb, :uA);

insert into public.collection_sources (collection_id, connection_id, root_reference, display_path, recursive, is_auto_folder, owner_user_id)
values (:colAP, :connX, 'rootF', 'Drive / A', true, true, :uA);

insert into public.documents (id, organization_id, connection_id, external_id, title, mime_type, last_seen_at)
values (:docA, :org1, :connX, 'fileA', 'File A', 'text/plain', now());

insert into public.collection_documents (collection_id, collection_source_id, external_id, title, mime_type, last_seen_at, status, document_id)
select :colAP, cs.id, 'fileA', 'File A', 'text/plain', now(), 'present', :docA
from public.collection_sources cs where cs.collection_id = :colAP limit 1;

-- ---------------------------------------------------------------------------
-- A tiny assertion helper (dropped with the rollback).
-- ---------------------------------------------------------------------------
create or replace function pg_temp.assert(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

-- impersonate(uid): set the JWT sub + switch to the RLS-bound role.
-- (Call `reset role` to return to the bypassing superuser for setup/teardown.)

-- ===========================================================================
-- READ: private is owner + super_admin only
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :uA, 'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.collections where id = :colAP) = 1, 'A can read own private');
select pg_temp.assert((select count(*) from public.collections where id = :colOrg) = 1, 'A can read org-wide');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :uB, 'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.collections where id = :colAP) = 0, 'B CANNOT read A private');
select pg_temp.assert((select count(*) from public.collections where id = :colOrg) = 1, 'B can read org-wide');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :uOA, 'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.collections where id = :colAP) = 0, 'ORG_ADMIN CANNOT read A private (leak guard)');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :uSA, 'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.collections where id = :colAP) = 1, 'super_admin can read A private');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :uC, 'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.collections where id = :colAP) = 0, 'cross-org CANNOT read A private');
select pg_temp.assert((select count(*) from public.collections where id = :colOrg) = 0, 'cross-org CANNOT read org1 org-wide');
reset role;

-- ===========================================================================
-- READ children compose: B cannot see A's source / schema / anchor
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :uB, 'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.collection_sources where collection_id = :colAP) = 0, 'B CANNOT read A private sources');
select pg_temp.assert((select count(*) from public.collection_schemas where id = :schemaA) = 0, 'B CANNOT read A private schema');
select pg_temp.assert((select count(*) from public.documents where id = :docA) = 0, 'B CANNOT read A private anchor');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :uA, 'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.collection_sources where collection_id = :colAP) = 1, 'A reads own private source');
select pg_temp.assert((select count(*) from public.collection_schemas where id = :schemaA) = 1, 'A reads own private schema');
select pg_temp.assert((select count(*) from public.documents where id = :docA) = 1, 'A reads own private anchor');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :uOA, 'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.assert((select count(*) from public.collection_schemas where id = :schemaA) = 0, 'ORG_ADMIN CANNOT read A private schema');
reset role;

-- ===========================================================================
-- WRITE: member confined to own private; WITH CHECK blocks org / private->org
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :uA, 'role','authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- A creates a NEW private collection (allowed)
  insert into public.collections (organization_id, name, description, visibility, created_by_user_id)
  values ('11111111-1111-1111-1111-111111111111', 'A new private', '', 'private',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  -- A tries to create an ORG collection (must be DENIED by with_check)
  begin
    insert into public.collections (organization_id, name, description, visibility, created_by_user_id)
    values ('11111111-1111-1111-1111-111111111111', 'A sneaky org', '', 'org',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'EXPECTED DENY: member created an org collection';
  exception when insufficient_privilege then null;
  end;
  -- A tries to set another owner (DENIED)
  begin
    insert into public.collections (organization_id, name, description, visibility, created_by_user_id)
    values ('11111111-1111-1111-1111-111111111111', 'A for B', '', 'private',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    raise exception 'EXPECTED DENY: member set another owner';
  exception when insufficient_privilege then null;
  end;
  -- A moves own private -> org (DENIED)
  begin
    update public.collections set visibility = 'org'
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    raise exception 'EXPECTED DENY: member moved private to org';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- B cannot write A's private collection or add a source to it
select set_config('request.jwt.claims', json_build_object('sub', :uB, 'role','authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    update public.collections set name = 'hijacked'
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    -- An update that matched 0 rows under RLS is not an error; assert nothing changed.
    if exists (select 1 from public.collections where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and name='hijacked') then
      raise exception 'EXPECTED DENY: B updated A private name';
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.collection_sources (collection_id, connection_id, root_reference, display_path, recursive, is_auto_folder, owner_user_id)
    values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dddddddd-dddd-dddd-dddd-dddddddddddd','rootG','x',true,true,
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    raise exception 'EXPECTED DENY: B added a source to A private';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- ===========================================================================
-- documents anchor: member can NEVER write it via RLS (definer-only)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :uA, 'role','authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    insert into public.documents (organization_id, connection_id, external_id, title, mime_type, last_seen_at)
    values ('11111111-1111-1111-1111-111111111111','dddddddd-dddd-dddd-dddd-dddddddddddd','fileZ','Z','text/plain', now());
    raise exception 'EXPECTED DENY: member INSERTed a documents anchor via RLS';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.documents set title = 'tampered' where id = 'e0ffffff-ffff-ffff-ffff-ffffffff0004';
    if exists (select 1 from public.documents where id='e0ffffff-ffff-ffff-ffff-ffffffff0004' and title='tampered') then
      raise exception 'EXPECTED DENY: member UPDATEd a documents anchor via RLS';
    end if;
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- ===========================================================================
-- Definer ownership gate: calling for a collection you do not own RAISEs
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :uB, 'role','authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.sync_upsert_private_anchors('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '[]'::jsonb);
    raise exception 'EXPECTED RAISE: B materialized anchors for A private';
  exception when others then
    if sqlerrm like 'ASSERTION FAILED%' or sqlerrm like 'EXPECTED RAISE%' then raise; end if;
  end;
end;
$$;
reset role;

-- ===========================================================================
-- Per-owner dedup: two members, same folder -> separate private collections
-- ===========================================================================
-- B privatizes the SAME (connX, rootF) A already has: must NOT collide.
select set_config('request.jwt.claims', json_build_object('sub', :uB, 'role','authenticated')::text, true);
set local role authenticated;
do $$
declare v_col uuid;
begin
  insert into public.collections (organization_id, name, description, visibility, created_by_user_id, is_auto_folder)
  values ('11111111-1111-1111-1111-111111111111','B private','', 'private',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true)
  returning id into v_col;
  insert into public.collection_sources (collection_id, connection_id, root_reference, display_path, recursive, is_auto_folder, owner_user_id)
  values (v_col, 'dddddddd-dddd-dddd-dddd-dddddddddddd','rootF','Drive / B', true, true,
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
end;
$$;
reset role;
-- Both A's and B's private sources over (connX, rootF) now coexist.
select pg_temp.assert(
  (select count(*) from public.collection_sources
   where connection_id = :connX and root_reference = 'rootF' and is_auto_folder) = 2,
  'two members over the same folder -> two separate private sources (no collision)');

-- The per-owner unique still bites: a SECOND auto-folder source for the SAME
-- owner over the SAME folder must fail.
do $$
begin
  begin
    insert into public.collection_sources (collection_id, connection_id, root_reference, display_path, recursive, is_auto_folder, owner_user_id)
    values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dddddddd-dddd-dddd-dddd-dddddddddddd','rootF','dup', true, true,
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'EXPECTED UNIQUE VIOLATION: same owner duplicated a private auto-folder';
  exception when unique_violation then null;
  end;
end;
$$;

-- ===========================================================================
-- Toggle OFF blocks ALL member private writes
-- ===========================================================================
update public.organizations set member_self_service_folders = false where id = :org1;
select set_config('request.jwt.claims', json_build_object('sub', :uA, 'role','authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    insert into public.collections (organization_id, name, description, visibility, created_by_user_id)
    values ('11111111-1111-1111-1111-111111111111','A toggled off','', 'private',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'EXPECTED DENY: member created private with toggle OFF';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select pg_temp.assert((select count(*) from public.collections where id = :colAP) = 1, 'A still READS own private with toggle off');
reset role;
update public.organizations set member_self_service_folders = true where id = :org1;

select 'ALL PHASE C1 RLS ASSERTIONS PASSED' as result;

rollback;
