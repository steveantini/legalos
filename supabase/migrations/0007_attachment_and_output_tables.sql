-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0007 — Attachment and output tables
--                   (Phase 2 implementation, Session 8e)
-- ============================================================================
--
-- Creates three new tables backing the architecture's attached references,
-- per-message file uploads, and formatted-output exports surfaces, per
-- docs/AGENT_ARCHITECTURE.md §schema-sketch:
--
--   public.agent_attachments    — permanent attachments scoped to an agent
--   public.message_attachments  — per-message uploads scoped to a single turn
--   public.formatted_outputs    — audit + dedup of exports (e.g., .docx)
--
-- All three tables ship with RLS enabled and explicit policies in the
-- user-owns + admin-read idiom established by 0001 (agents) and 0004
-- (conversations / messages / usage_events).
--
-- No application code reads these tables yet. Subsequent Phase 2 sessions
-- exercise them for permanent attachments, per-message uploads, and Word
-- .docx exports.
--
-- Idempotence: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and
-- DROP POLICY IF EXISTS / CREATE POLICY for every policy. Triggers are
-- dropped-and-recreated. Re-running this migration after a partial apply
-- recovers cleanly.
-- ============================================================================


-- ============================================================================
-- Table: agent_attachments
-- ============================================================================
-- Permanent attachments tied to a user-owned agent. Up to 5 attachments per
-- agent enforced at application level (architecture §3); the DB does not
-- hardcode the count limit.
--
-- delivery_mode: 'text_extracted' in v1 (Path B). Future values 'native_pdf'
--   and 'hybrid' (Path C) are accepted by the CHECK constraint so the schema
--   is forward-compatible without a column change.
-- source_type: 'upload' in v1. Future value 'gdrive_link' for the Google
--   Drive integration. Same forward-compat strategy.
-- extracted_text: cached text extraction so chat turns do not re-parse on
--   every request. Populated by the upload handler in a later session.
-- user_id / organization_id: denormalized from the parent agent so RLS can
--   enforce ownership without a per-row join through agents.

create table if not exists public.agent_attachments (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid not null references public.agents (id) on delete cascade,
  user_id           uuid not null references public.users (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  storage_path      text not null,
  original_filename text not null,
  content_type      text not null,
  size_bytes        bigint not null,
  extracted_text    text,
  delivery_mode     text not null default 'text_extracted',
  source_type       text not null default 'upload',
  source_metadata   jsonb,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint agent_attachments_delivery_mode_check
    check (delivery_mode in ('text_extracted', 'native_pdf', 'hybrid')),
  constraint agent_attachments_source_type_check
    check (source_type in ('upload', 'gdrive_link'))
);

create index if not exists agent_attachments_agent_id_active_idx
  on public.agent_attachments (agent_id)
  where deleted_at is null;

create index if not exists agent_attachments_user_id_created_at_idx
  on public.agent_attachments (user_id, created_at);

drop trigger if exists agent_attachments_updated_at on public.agent_attachments;
create trigger agent_attachments_updated_at
  before update on public.agent_attachments
  for each row execute function public.set_updated_at();

alter table public.agent_attachments enable row level security;


-- ============================================================================
-- Table: message_attachments
-- ============================================================================
-- Per-message uploads (architecture §5a). Turn-scoped; the chat input
-- gains a paperclip that uploads here, the file's extracted text enters
-- the user's message turn, and the row is deleted along with its parent
-- message. user_id and organization_id are denormalized to avoid per-row
-- joins through messages → conversations.

create table if not exists public.message_attachments (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid not null references public.messages (id) on delete cascade,
  user_id           uuid not null references public.users (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  storage_path      text not null,
  original_filename text not null,
  content_type      text not null,
  size_bytes        bigint not null,
  extracted_text    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists message_attachments_message_id_idx
  on public.message_attachments (message_id);

drop trigger if exists message_attachments_updated_at on public.message_attachments;
create trigger message_attachments_updated_at
  before update on public.message_attachments
  for each row execute function public.set_updated_at();

alter table public.message_attachments enable row level security;


-- ============================================================================
-- Table: formatted_outputs
-- ============================================================================
-- Records every exported message (e.g., .docx download). Earns its keep
-- two ways: audit ("did this user export this message?"), and dedup
-- (clicking the download button twice returns the same file rather than
-- re-rendering).
--
-- format: 'docx' in v1. The architecture lists 'xlsx', 'pptx', and Google
--   Workspace formats as deferred. The CHECK constraint stays narrow for
--   now and widens when those formats land.
-- storage_path: nullable. The renderer may persist the file in Storage or
--   regenerate on demand; the table's shape supports either choice.
-- on delete restrict on user_id: deleting a user should not silently erase
--   their export history (matches the usage_events pattern from 0004).

create table if not exists public.formatted_outputs (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations (id) on delete cascade,
  message_id        uuid not null references public.messages (id) on delete cascade,
  user_id           uuid not null references public.users (id) on delete restrict,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  format            text not null,
  storage_path      text,
  size_bytes        bigint,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint formatted_outputs_format_check
    check (format in ('docx'))
);

create index if not exists formatted_outputs_message_id_idx
  on public.formatted_outputs (message_id);

create index if not exists formatted_outputs_user_id_created_at_idx
  on public.formatted_outputs (user_id, created_at);

drop trigger if exists formatted_outputs_updated_at on public.formatted_outputs;
create trigger formatted_outputs_updated_at
  before update on public.formatted_outputs
  for each row execute function public.set_updated_at();

alter table public.formatted_outputs enable row level security;


-- ============================================================================
-- RLS Policies: agent_attachments
-- ============================================================================
-- A user owns rows whose user_id matches them and whose parent agent they
-- created. The with-check verifies the agent ownership cross-cut at write
-- time so a user cannot insert a row pointing at someone else's agent_id
-- even if they spoof the denormalized fields. SELECT uses only the
-- denormalized user_id (no join) for performance.
-- Org-level admins can read all rows in their organization.

drop policy if exists agent_attachments_user_owns on public.agent_attachments;
create policy agent_attachments_user_owns
  on public.agent_attachments
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
    and exists (
      select 1 from public.agents a
      where a.id = agent_attachments.agent_id
        and a.created_by = auth.uid()
    )
  );

drop policy if exists agent_attachments_admin_read on public.agent_attachments;
create policy agent_attachments_admin_read
  on public.agent_attachments
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- RLS Policies: message_attachments
-- ============================================================================
-- Access flows through ownership of the parent message → conversation,
-- mirroring the messages_user_via_conversation policy from 0004. The
-- with-check additionally requires the denormalized user_id and
-- organization_id to match auth.uid() and current_org_id().
-- Org-level admins can read all rows in their organization.

drop policy if exists message_attachments_user_via_conversation on public.message_attachments;
create policy message_attachments_user_via_conversation
  on public.message_attachments
  for all
  using (
    exists (
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_attachments.message_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
    and exists (
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_attachments.message_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists message_attachments_admin_read on public.message_attachments;
create policy message_attachments_admin_read
  on public.message_attachments
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- RLS Policies: formatted_outputs
-- ============================================================================
-- A user owns rows where user_id matches and the parent conversation is
-- theirs. SELECT uses the denormalized user_id (no join). Writes verify
-- the conversation ownership cross-cut.
-- Org-level admins can read all rows in their organization.

drop policy if exists formatted_outputs_user_via_conversation on public.formatted_outputs;
create policy formatted_outputs_user_via_conversation
  on public.formatted_outputs
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
    and exists (
      select 1 from public.conversations c
      where c.id = formatted_outputs.conversation_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists formatted_outputs_admin_read on public.formatted_outputs;
create policy formatted_outputs_admin_read
  on public.formatted_outputs
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Reverse:
--   drop table if exists public.formatted_outputs;
--   drop table if exists public.message_attachments;
--   drop table if exists public.agent_attachments;
-- (cascade-drops indexes, triggers, and policies along with the tables)
-- ============================================================================
