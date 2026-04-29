-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0008 — Attachment storage buckets + policies
--                   (Phase 2 implementation, Session 8e)
-- ============================================================================
--
-- Creates two private Supabase Storage buckets and the access policies that
-- align them with the table-level RLS established in 0007:
--
--   agent-attachments    — permanent files tied to agents
--   message-attachments  — turn-scoped per-message uploads
--
-- Both buckets enforce a 20MB per-file size cap (file_size_limit) and a MIME
-- allowlist (allowed_mime_types) at the storage layer, so a misbehaving
-- client cannot bypass them via direct API call. Architecture §3 lists the
-- v1 format set: PDF, DOCX, TXT, MD, XLSX.
--
-- Path convention:
--   agent-attachments    →  <user_id>/<agent_id>/<filename>
--   message-attachments  →  <user_id>/<conversation_id>/<message_id>/<filename>
--
-- The first path segment is auth.uid() in both schemes, which lets the
-- storage policies enforce ownership via
-- (storage.foldername(name))[1] = auth.uid()::text.
--
-- All policies are dropped-and-recreated for idempotence. Bucket inserts
-- use ON CONFLICT (id) DO NOTHING; once a bucket exists, re-running this
-- migration does not overwrite its file_size_limit / allowed_mime_types
-- settings. To change those after first apply, alter the bucket directly.
-- ============================================================================


-- ============================================================================
-- Bucket: agent-attachments
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-attachments',
  'agent-attachments',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;


-- ============================================================================
-- Bucket: message-attachments
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;


-- ============================================================================
-- Storage policies: agent-attachments
-- ============================================================================
-- Owner policies allow the user to read, insert, update, and delete their
-- own files (path[1] = auth.uid()).
-- Admin read policy allows org_admin / super_admin to read any file whose
-- owning user is in the same organization (looked up via path[1] →
-- public.users.organization_id).

drop policy if exists agent_attachments_storage_user_select on storage.objects;
create policy agent_attachments_storage_user_select
  on storage.objects for select
  using (
    bucket_id = 'agent-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists agent_attachments_storage_user_insert on storage.objects;
create policy agent_attachments_storage_user_insert
  on storage.objects for insert
  with check (
    bucket_id = 'agent-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists agent_attachments_storage_user_update on storage.objects;
create policy agent_attachments_storage_user_update
  on storage.objects for update
  using (
    bucket_id = 'agent-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'agent-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists agent_attachments_storage_user_delete on storage.objects;
create policy agent_attachments_storage_user_delete
  on storage.objects for delete
  using (
    bucket_id = 'agent-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists agent_attachments_storage_admin_select on storage.objects;
create policy agent_attachments_storage_admin_select
  on storage.objects for select
  using (
    bucket_id = 'agent-attachments'
    and public.current_user_role() in ('super_admin', 'org_admin')
    and exists (
      select 1 from public.users u
      where u.id::text = (storage.foldername(name))[1]
        and u.organization_id = public.current_org_id()
    )
  );


-- ============================================================================
-- Storage policies: message-attachments
-- ============================================================================
-- Same five-policy shape as agent-attachments, scoped to the
-- message-attachments bucket. Path scheme differs but the ownership check
-- is identical (path[1] is the owning user_id in both buckets).

drop policy if exists message_attachments_storage_user_select on storage.objects;
create policy message_attachments_storage_user_select
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists message_attachments_storage_user_insert on storage.objects;
create policy message_attachments_storage_user_insert
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists message_attachments_storage_user_update on storage.objects;
create policy message_attachments_storage_user_update
  on storage.objects for update
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists message_attachments_storage_user_delete on storage.objects;
create policy message_attachments_storage_user_delete
  on storage.objects for delete
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists message_attachments_storage_admin_select on storage.objects;
create policy message_attachments_storage_admin_select
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and public.current_user_role() in ('super_admin', 'org_admin')
    and exists (
      select 1 from public.users u
      where u.id::text = (storage.foldername(name))[1]
        and u.organization_id = public.current_org_id()
    )
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Reverse:
--   drop policy if exists ... on storage.objects;  -- (each of the 10 above)
--   delete from storage.buckets where id in ('agent-attachments', 'message-attachments');
-- Note: deleting a bucket while objects exist will fail; clean objects first.
-- ============================================================================
