-- ============================================================================
-- 20260627100000_folder_backed_collections.sql
-- Knowledge folders rework, Step 2 — folder-backed (auto) collections + the
-- member-self-service toggle (added, defaulted OFF; member path is step 2b).
-- ============================================================================
--
-- WHY. Folder-picking becomes the primary scoping act in Research: a user picks
-- a folder and the system find-or-creates an INVISIBLE collection backing it
-- (never surfaced as "a Collection"). For that to be idempotent, the same folder
-- picked twice must reuse one collection, never mint duplicates. Today there is
-- NO uniqueness on collection_sources(connection_id, root_reference) and the add
-- path blind-inserts, so this migration adds the dedup identity. It also adds
-- the org-level member-self-service toggle now (off), so step 2b is a clean
-- follow-up; nothing in this migration loosens any gate.
--
-- AUTO-FOLDER MARKER, scoped so admin-curated collections are never touched.
-- `is_auto_folder` distinguishes the picker's find-or-create collections from
-- admin-curated (possibly multi-source) ones. The uniqueness is a PARTIAL unique
-- index over auto-folder sources only:
--     unique (connection_id, root_reference) WHERE is_auto_folder
-- so two auto-folder picks of the same folder collide (reuse), while admin
-- curated collections (is_auto_folder = false) may legitimately point several
-- sources at the same or overlapping folders, unconstrained. (connection_id is
-- org-unique, since a connection belongs to exactly one organization, so no org
-- column is needed in the key.) The flag lives on BOTH tables: on collections it
-- drives the reuse-vs-never-collide decision; on collection_sources it scopes
-- the partial index (a source is created with its collection and never
-- reparented, so the denormalized flag cannot drift). Existing rows default to
-- false (admin-curated), so no backfill is needed.
-- ============================================================================

alter table public.collections
  add column if not exists is_auto_folder boolean not null default false;

alter table public.collection_sources
  add column if not exists is_auto_folder boolean not null default false;

-- The dedup identity: at most one AUTO-FOLDER collection per folder. Partial, so
-- admin-curated sources (is_auto_folder = false) are entirely unconstrained.
create unique index if not exists collection_sources_auto_folder_key
  on public.collection_sources (connection_id, root_reference)
  where is_auto_folder;

-- The member-self-service toggle (org-level, mirrors organizations.default_model
-- and organizations.research_document_cap). Added OFF; NOT wired to loosen any
-- gate in this step. Step 2b reads it to allow members to create their own
-- folder-backed (private) collections, behind the new visibility tier + RLS.
alter table public.organizations
  add column if not exists member_self_service_folders boolean not null default false;

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Columns present:
--    select table_name, column_name from information_schema.columns
--     where table_schema = 'public'
--       and ((table_name = 'collections' and column_name = 'is_auto_folder')
--         or (table_name = 'collection_sources' and column_name = 'is_auto_folder')
--         or (table_name = 'organizations' and column_name = 'member_self_service_folders'));
--    -- expect: 3 rows.
--
-- 2. The partial unique index exists and is partial:
--    select indexname, indexdef from pg_indexes
--     where tablename = 'collection_sources'
--       and indexname = 'collection_sources_auto_folder_key';
--    -- expect: 1 row; indexdef contains "WHERE is_auto_folder" and "UNIQUE".
--
-- 3. Existing collections are all admin-curated (default false):
--    select count(*) from public.collections where is_auto_folder; -- expect 0.
--
-- 4. The toggle defaults off:
--    select count(*) from public.organizations where member_self_service_folders; -- expect 0.
