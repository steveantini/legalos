-- ============================================================================
-- 0046_message_attachments_drive.sql
-- Connector hub arc, Milestone 6b — make message_attachments Drive-ready
-- ============================================================================
--
-- Adds the two columns agent_attachments already carries (migration 0007) so
-- the per-message attachment surface matches the per-agent one: a source_type
-- discriminator and a source_metadata jsonb. After this, a message-level
-- gdrive_link attachment resolves live at run-time exactly like an agent one
-- (the M6a resolver already handles both).
--
--   source_type     'upload' (a local file in the message-attachments bucket)
--                   or 'gdrive_link' (a connected Drive file read live). Default
--                   'upload' makes this backfill-free — every existing row is
--                   correct with no data migration.
--   source_metadata For gdrive_link rows: { "fileId", "name", "mimeType" }.
--                   Null for uploads.
--
-- RLS is row-level, not column-level, so the existing message_attachments
-- policies (migration 0007) already cover the new columns — no policy change.
-- Only these two columns are added; no existing column is altered.
--
-- Apply by hand in the Supabase SQL Editor (repo unlinked; no db push).
-- Idempotent: ADD COLUMN IF NOT EXISTS + a guarded CHECK, safe to re-run.
-- ============================================================================

alter table public.message_attachments
  add column if not exists source_type text not null default 'upload',
  add column if not exists source_metadata jsonb;

-- Match agent_attachments' CHECK convention (migration 0007). Guarded so a
-- re-run does not error on the already-present constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'message_attachments_source_type_check'
  ) then
    alter table public.message_attachments
      add constraint message_attachments_source_type_check
      check (source_type in ('upload', 'gdrive_link'));
  end if;
end $$;

comment on column public.message_attachments.source_type is
  'Attachment source: ''upload'' (local file in the message-attachments bucket) or ''gdrive_link'' (a connected Drive file read live at run-time). Mirrors agent_attachments.source_type (migration 0007).';
comment on column public.message_attachments.source_metadata is
  'For gdrive_link rows: { "fileId", "name", "mimeType" } (file id plus pick-time display name and Drive mimeType). Null for uploads. Mirrors agent_attachments.source_metadata.';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. Both columns exist with the right types / default:
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'message_attachments'
--     and column_name in ('source_type', 'source_metadata')
--   order by column_name;
--   -- expect: source_metadata | jsonb | (null)        | YES
--   --         source_type     | text  | 'upload'::text | NO
--
--   -- 2. The CHECK constraint matches agent_attachments' convention:
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.message_attachments'::regclass
--     and conname = 'message_attachments_source_type_check';
--   -- expect: CHECK (source_type = ANY (ARRAY['upload'::text, 'gdrive_link'::text]))
--
--   -- 3. Every existing row defaulted to 'upload' (backfill-free):
--   select source_type, count(*) from public.message_attachments group by source_type;
--
--   -- 4. RLS is still enabled (unchanged by this migration):
--   select relrowsecurity from pg_class
--   where oid = 'public.message_attachments'::regclass;  -- expect: true
-- ============================================================================
