-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0004 — Native agent runtime (Phase 2 foundations, Session 8a)
-- ============================================================================
--
-- Adds the three tables that back the native-agent chat runtime:
--   - conversations  (one row per chat thread; snapshots system_prompt + model)
--   - messages       (one row per turn; immutable in practice)
--   - usage_events   (append-only cost ledger)
--
-- All three tables have RLS enabled with explicit policies, paired user-owns
-- + admin-read in the same idiom 0001 established for the agents table.
-- See DECISION_LOG.md D-023 for the Phase 2 runtime architecture.
-- ============================================================================


-- ============================================================================
-- Enum: message_role
-- ============================================================================

create type public.message_role as enum ('user', 'assistant', 'system');


-- ============================================================================
-- Table: conversations
-- ============================================================================
-- One chat thread between a user and a native agent.
--
-- system_prompt_snapshot / model_snapshot are frozen at conversation creation
-- per CLAUDE.md AI Integration Rules ("old conversations retain their original
-- prompt for reproducibility"). A full agent_prompt_versions table is overkill
-- for Phase 2 foundations — the per-conversation snapshot is the minimum that
-- honors the rule and is forward-compatible with versioning later.
--
-- organization_id is denormalized from user_id for the same reason it is on
-- agents in 0001: defense-in-depth RLS without a per-row join through users.

create table public.conversations (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  user_id                  uuid not null references public.users (id) on delete cascade,
  agent_id                 uuid not null references public.agents (id) on delete restrict,
  system_prompt_snapshot   text not null,
  model_snapshot           text not null,
  title                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index conversations_user_id_idx         on public.conversations (user_id);
create index conversations_agent_id_idx        on public.conversations (agent_id);
create index conversations_organization_id_idx on public.conversations (organization_id);

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;


-- ============================================================================
-- Table: messages
-- ============================================================================
-- Individual turns inside a conversation. Immutable in practice — no UPDATE
-- path in the chat route. tokens_in / tokens_out are populated server-side
-- on the assistant row from Anthropic's stream final usage.
--
-- updated_at + trigger included to match the CLAUDE.md SQL convention even
-- though messages will not be updated; it costs nothing and keeps the
-- table-creation pattern uniform across the project.

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  role             public.message_role not null,
  content          text not null,
  tokens_in        integer,
  tokens_out       integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id, created_at);

create trigger messages_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

alter table public.messages enable row level security;


-- ============================================================================
-- Table: usage_events
-- ============================================================================
-- Append-only per-call cost ledger. Written by the chat route after every
-- successful Anthropic call. Required by CLAUDE.md AI Integration Rules
-- ("Cost tracking from day one of native agents").
--
-- cost_micro_usd stores cost as integer micro-dollars (1_000_000 = $1) to
-- avoid float drift across millions of rows. Math: tokens × dollars-per-million
-- yields micro-USD directly.
--
-- on delete restrict on user_id and agent_id preserves cost-history integrity:
-- deleting a user or agent should not silently erase the billing record.
-- conversation_id and message_id use on delete set null so cleaning up old
-- conversations does not orphan-delete the cost ledger.

create table public.usage_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete restrict,
  agent_id         uuid not null references public.agents (id) on delete restrict,
  conversation_id  uuid references public.conversations (id) on delete set null,
  message_id       uuid references public.messages (id) on delete set null,
  model            text not null,
  tokens_in        integer not null,
  tokens_out       integer not null,
  cost_micro_usd   bigint not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index usage_events_user_id_idx         on public.usage_events (user_id, created_at);
create index usage_events_agent_id_idx        on public.usage_events (agent_id, created_at);
create index usage_events_organization_id_idx on public.usage_events (organization_id, created_at);

create trigger usage_events_updated_at
  before update on public.usage_events
  for each row execute function public.set_updated_at();

alter table public.usage_events enable row level security;


-- ============================================================================
-- RLS Policies: conversations
-- ============================================================================
-- Users can read, insert, update, and delete their own conversations.
-- Org-level admins can read (but not write) all conversations in their org.

create policy conversations_user_owns
  on public.conversations
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
  );

create policy conversations_admin_read
  on public.conversations
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- RLS Policies: messages
-- ============================================================================
-- Access flows through ownership of the parent conversation. A user can read,
-- insert, update, delete messages in conversations they own. Org-level admins
-- can read (but not write) all messages in conversations in their org.

create policy messages_user_via_conversation
  on public.messages
  for all
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy messages_admin_read
  on public.messages
  for select
  using (
    public.current_user_role() in ('super_admin', 'org_admin')
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.organization_id = public.current_org_id()
    )
  );


-- ============================================================================
-- RLS Policies: usage_events
-- ============================================================================
-- Append-only for users: INSERT (own row only) and SELECT (own row only).
-- No UPDATE or DELETE policies = the cost ledger is immutable from any user
-- session. Service-role still bypasses RLS if administrative cleanup is ever
-- needed. Org-level admins can SELECT all rows in their org.

create policy usage_events_user_inserts_own
  on public.usage_events
  for insert
  with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
  );

create policy usage_events_user_reads_own
  on public.usage_events
  for select
  using (user_id = auth.uid());

create policy usage_events_admin_read
  on public.usage_events
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Next steps (Session 8a continued):
--   - lib/anthropic/ helpers (client wrapper, streaming, pricing, prompt-defense)
--   - per-user rate limiter (counts user-role messages in last minute)
--   - app/api/chat/route.ts handler
--   - supabase/seed/0003_test_native_agent.sql (one row, claude-sonnet-4-6)
--   - curl smoke test (local + prod)
-- ============================================================================
