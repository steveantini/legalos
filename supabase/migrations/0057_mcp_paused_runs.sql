-- ============================================================================
-- 0057_mcp_paused_runs.sql
-- Phase 2, 2P-7b-i — interactive MCP write-confirmation (pause-and-resume)
-- ============================================================================
--
-- The agentic chat loop (2P-6b) runs many model turns inside ONE serverless
-- request. When the model requests a WRITE tool, v1 silently blocked it. To
-- make a write human-approvable we must pause the loop for an out-of-band
-- decision (Approve / Deny), which a single serverless request cannot await.
-- So we PAUSE-AND-RESUME ACROSS REQUESTS: on a write, the loop persists the
-- state needed to resume deterministically plus the pending action into this
-- table, ends the request cleanly, and shows the user an Approve/Deny card; a
-- separate, owner-authorized decision resumes the loop in a fresh request.
--
-- TENANT / TRUST BOUNDARY: a paused run holds the user's own conversation data
-- (the model's content blocks so far and the write's tool input), scoped to the
-- owning user exactly like the messages it belongs to. RLS below enforces that
-- only the owning user can read or resume their run (org admins read-only, like
-- conversations/messages).
--
-- NO SECRETS ARE STORED HERE. pending_tool_call carries the token_ref (a pointer
-- to where the encrypted token lives), NEVER a token. The resume path re-resolves
-- a live access token through getUsableAccessToken, exactly as the loop does
-- today. See the pending_tool_call column comment.
--
-- DEPLOY ORDERING: the flag-off / no-MCP chat path never touches this table, so
-- it is byte-identical whether or not this migration is applied. The write-
-- confirmation feature (loop path, MCP_AGENT_TOOLS_ENABLED on) requires this
-- table; the code degrades gracefully if it is missing (a failed paused-run
-- insert falls back to the legacy "blocked, nothing sent" hold), but the feature
-- is only fully functional once this is applied. Apply BEFORE relying on
-- write-confirmation. Apply in the Supabase SQL Editor (the project's standard
-- migration path).
-- ============================================================================


-- ============================================================================
-- Table: mcp_paused_runs
-- ============================================================================
-- One row per paused agent loop awaiting a human write-confirmation decision.

create table public.mcp_paused_runs (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.conversations (id) on delete cascade,
  -- The assistant message being built for this turn. The resume path UPDATES
  -- this message with the continuation, so one user turn stays one assistant
  -- message even across the pause. Cascades if the message is removed.
  message_id         uuid not null references public.messages (id) on delete cascade,
  -- The owner (the user whose conversation this is). The decision endpoint
  -- verifies the deciding user IS this user; RLS enforces the same.
  user_id            uuid not null references public.users (id) on delete cascade,
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'denied', 'resuming', 'resumed', 'expired')),
  pending_tool_call  jsonb not null,
  loop_state         jsonb not null,
  decision           jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.mcp_paused_runs is
  'A paused agentic MCP loop awaiting a human Approve/Deny decision on a write tool (2P-7b). Holds the resumable loop state + the pending action, scoped to the owning user like the conversation it belongs to. NO secrets: pending_tool_call stores a token_ref pointer, never a token.';
comment on column public.mcp_paused_runs.pending_tool_call is
  'The write the model requested, with everything needed to execute it on resume (2P-7b-ii): namespaced tool name, the route identifiers serverId / connectionId / token_ref / serverUrl / originalToolName, the tool_use id, the raw tool input, and a PII-safe argKeys summary. token_ref is a POINTER to the encrypted token (re-resolved live via getUsableAccessToken on resume); the raw token is NEVER written here.';
comment on column public.mcp_paused_runs.loop_state is
  'Everything needed to resume the loop deterministically: the system blocks, the accumulated content-block loop messages (including the paused assistant turn), the tool_results already produced this turn, the pending tool_use id, the accumulated assistant text / sources / tool_calls trace / round count, summed usage so far, and the model/agent/org context. This is the user''s own conversation data (model content + the write''s input), kept here rather than in message history so the persisted history stays string text + tool_calls JSONB. No tokens.';
comment on column public.mcp_paused_runs.decision is
  'The recorded decision once made: { choice: ''approve'' | ''deny'', decided_at }. Null while status is ''pending''.';

create index mcp_paused_runs_conversation_id_idx on public.mcp_paused_runs (conversation_id);
create index mcp_paused_runs_user_id_idx         on public.mcp_paused_runs (user_id);
create index mcp_paused_runs_message_id_idx       on public.mcp_paused_runs (message_id);
-- Fast lookup of a conversation's still-open confirmation on reload.
create index mcp_paused_runs_pending_idx
  on public.mcp_paused_runs (conversation_id)
  where status = 'pending';

create trigger mcp_paused_runs_updated_at
  before update on public.mcp_paused_runs
  for each row execute function public.set_updated_at();

alter table public.mcp_paused_runs enable row level security;


-- ============================================================================
-- RLS Policies: mcp_paused_runs
-- ============================================================================
-- Mirrors conversations: the owning user has full access (read + resume their
-- own paused run); org-level admins can read (but not write) runs in their org.
-- A user can never see or resume another user's paused run.

create policy mcp_paused_runs_user_owns
  on public.mcp_paused_runs
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
  );

create policy mcp_paused_runs_admin_read
  on public.mcp_paused_runs
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- table + RLS present
--   select relname, relrowsecurity
--   from pg_class where relname = 'mcp_paused_runs';
--   -- expect: relrowsecurity = true
--
--   -- policies present
--   select polname from pg_policy
--   where polrelid = 'public.mcp_paused_runs'::regclass
--   order by polname;
--   -- expect: mcp_paused_runs_admin_read, mcp_paused_runs_user_owns
--
--   -- columns + types
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'mcp_paused_runs'
--   order by ordinal_position;
--
--   -- no secret columns (sanity: only token_ref pointers live inside the jsonb)
--   -- expect NO column named token / access_token / secret.
-- ============================================================================
