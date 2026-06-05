-- ============================================================================
-- 0061_workflow_approvals_and_autonomy.sql
-- Workflows arc, Step 3 — human checkpoints, approved writes, and autonomy
-- ============================================================================
--
-- Completes the engine's safety/write model by generalizing the PROVEN Phase 2
-- chat write-confirmation pattern (mcp_paused_runs) to workflow runs: a run can
-- PAUSE durably for a human decision and RESUME across requests, with an ATOMIC
-- pending→resolving claim guaranteeing an approved write executes AT MOST ONCE.
--
-- This adds:
--   workflow_runs.autonomy_level   — the co-pilot ↔ auto-pilot setting. A RUN-
--     level property (the same definition can run supervised or, later, more
--     autonomously). v1 ships 'supervised' live; 'autonomous' is represented but
--     ITS WRITES STILL REQUIRE APPROVAL (no unattended writes in any mode).
--   workflow_pending_approvals     — one row per open decision a paused run is
--     waiting on (a human_checkpoint gate, or a write action awaiting approval).
--     For a write it stores the resolved route's TOKEN_REF ONLY (a pointer), the
--     toolInput, and the toolUseId — NEVER a token. The resume re-resolves a live
--     token through the same getUsableAccessToken path executeMcpTool uses.
--   workflow_step_runs.approval_mode — per-step provenance for the legal audit
--     trail: was this checkpoint/write 'human_approved' or 'auto_proceeded'?
--
-- NO SECRETS ARE STORED HERE. pending_action carries token_ref pointers only.
--
-- DEPLOY ORDERING: requires 0060 (the workflow tables). Nothing outside the
-- Workflows surface touches these columns/tables, so the rest of the app is
-- byte-identical whether or not this is applied; the engine degrades to Step 2
-- behavior (no write execution) until applied. Apply AFTER 0060, BEFORE relying
-- on checkpoints / approved writes. Apply in the Supabase SQL Editor.
-- ============================================================================


-- ============================================================================
-- workflow_runs.autonomy_level — the run-level co-pilot ↔ auto-pilot setting
-- ============================================================================
-- 'supervised' (default, v1 live): human_checkpoint steps pause for approval;
--   write actions pause for approval before executing.
-- 'autonomous' (represented; safe subset only in v1): may auto-clear pure
--   human_checkpoint pause-gates (no side effect) and runs read steps inline, but
--   WRITES STILL REQUIRE APPROVAL — unattended write auto-execution is a
--   deliberately gated future capability a firm must explicitly opt into.

alter table public.workflow_runs
  add column autonomy_level text not null default 'supervised'
    check (autonomy_level in ('supervised', 'autonomous'));

comment on column public.workflow_runs.autonomy_level is
  'The run-level autonomy setting (co-pilot ↔ auto-pilot). supervised (default): checkpoints + writes pause for human approval. autonomous: may auto-clear checkpoint gates + run reads inline, but writes STILL require approval in v1 (no unattended writes in any mode; gated auto-write is a deferred capability).';


-- ============================================================================
-- workflow_step_runs.approval_mode — per-step approval provenance (audit)
-- ============================================================================
-- Records HOW a checkpoint or write step was cleared, for the legal question
-- "was this human-reviewed or run autonomously?". Null when no approval was
-- involved (a read agent-step / read tool_action), or while a step is still
-- awaiting a decision.

alter table public.workflow_step_runs
  add column approval_mode text
    check (approval_mode in ('human_approved', 'auto_proceeded'));

comment on column public.workflow_step_runs.approval_mode is
  'How a checkpoint/write step was cleared: human_approved (a person approved it) or auto_proceeded (an autonomous run auto-cleared a pause-gate). Null for read steps and for a step still awaiting a decision.';


-- ============================================================================
-- Table: workflow_pending_approvals
-- ============================================================================
-- One row per open decision a paused workflow run awaits. The run's status is
-- 'awaiting_approval' while a pending row exists; the engine resumes when the
-- row is decided. Mirrors mcp_paused_runs' role for chat, generalized to runs.

create table public.workflow_pending_approvals (
  id               uuid primary key default gen_random_uuid(),
  workflow_run_id  uuid not null references public.workflow_runs (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  -- The stable step id (+ its 0-based sequence) the run is paused at, so resume
  -- re-enters the engine at exactly this step in the run's definition_snapshot.
  step_id          text not null,
  sequence         integer not null,
  kind             text not null check (kind in ('checkpoint', 'write')),
  -- For a 'write': { route: { serverId, connectionId, tokenRef, serverUrl,
  --   originalToolName }, toolInput, toolUseId }. tokenRef is a POINTER into
  --   connection_secrets; NO token is ever written here (re-resolved live on
  --   resume via getUsableAccessToken, exactly as executeMcpTool does).
  -- For a 'checkpoint': { prompt } — the context to show the approver.
  pending_action   jsonb not null,
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'denied', 'resolving')),
  decided_by       uuid references public.users (id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.workflow_pending_approvals is
  'One open decision a paused workflow run awaits (a human_checkpoint gate, or a write action awaiting approval). The atomic pending→resolving claim guarantees an approved write executes at most once. NO secrets: a write''s pending_action stores a token_ref pointer, never a token.';
comment on column public.workflow_pending_approvals.pending_action is
  'For a write: the resolved route (serverId / connectionId / token_ref / serverUrl / originalToolName), the toolInput, and the toolUseId — token_ref is a POINTER, never a token (re-resolved live on resume). For a checkpoint: the prompt/context to show the approver.';

create index workflow_pending_approvals_run_id_idx on public.workflow_pending_approvals (workflow_run_id);
create index workflow_pending_approvals_org_id_idx  on public.workflow_pending_approvals (organization_id);
-- Fast lookup of a run's still-open decision.
create index workflow_pending_approvals_open_idx
  on public.workflow_pending_approvals (workflow_run_id)
  where status = 'pending';

create trigger workflow_pending_approvals_updated_at
  before update on public.workflow_pending_approvals
  for each row execute function public.set_updated_at();

alter table public.workflow_pending_approvals enable row level security;


-- ============================================================================
-- RLS Policies: workflow_pending_approvals
-- ============================================================================
-- Gated through the parent run (mirrors workflow_step_runs): the run's owner
-- (the triggering user) can read AND decide their run's approvals; org admins
-- read for oversight. A user can never see or decide another user's approvals.

create policy workflow_pending_approvals_owner
  on public.workflow_pending_approvals
  for all
  using (
    exists (
      select 1 from public.workflow_runs r
      where r.id = workflow_run_id
        and r.triggered_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workflow_runs r
      where r.id = workflow_run_id
        and r.triggered_by = auth.uid()
        and r.organization_id = public.current_org_id()
    )
  );

create policy workflow_pending_approvals_admin_read
  on public.workflow_pending_approvals
  for select
  using (
    exists (
      select 1 from public.workflow_runs r
      where r.id = workflow_run_id
        and r.organization_id = public.current_org_id()
        and public.current_user_role() in ('super_admin', 'org_admin')
    )
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- autonomy column present, default supervised, NOT NULL
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'workflow_runs' and column_name = 'autonomy_level';
--   -- expect: text, NO, 'supervised'::text
--
--   -- approval_mode column present (nullable)
--   select column_name, is_nullable from information_schema.columns
--   where table_name = 'workflow_step_runs' and column_name = 'approval_mode';
--   -- expect: one row, is_nullable = YES
--
--   -- pending-approvals table + RLS present
--   select relname, relrowsecurity from pg_class
--   where relname = 'workflow_pending_approvals';
--   -- expect: relrowsecurity = true
--
--   -- policies present
--   select polname from pg_policy
--   where polrelid = 'public.workflow_pending_approvals'::regclass
--   order by polname;
--   -- expect: workflow_pending_approvals_admin_read, workflow_pending_approvals_owner
--
--   -- NO secret columns (sanity: only token_ref pointers live inside the jsonb)
--   -- expect NO column named token / access_token / secret.
-- ============================================================================
