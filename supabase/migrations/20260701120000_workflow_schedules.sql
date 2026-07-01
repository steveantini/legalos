-- ============================================================================
-- 20260701120000_workflow_schedules.sql
-- Watcher arc, Stage 1 — the scheduling foundation (SHIPS DARK)
-- ============================================================================
--
-- A sibling to workflow_definitions that records a CADENCE: "run this workflow
-- for this owner every N seconds." A scheduled tick (the /api/cron/run-schedules
-- route) selects due rows and drives each through the headless run core
-- (executeWorkflowRunWith), attributing every spawned run to the schedule's
-- HUMAN owner (owner_user_id -> workflow_runs.triggered_by, option 2c). Because
-- the run is owned by that human, the EXISTING owner-scoped RLS on workflow_runs
-- / workflow_step_runs / workflow_pending_approvals admits their pause / approve
-- / resume / read with NO policy change — this migration adds NO policy to any of
-- those tables and does not touch them.
--
-- SHIPS DARK: this table is created EMPTY and no code writes to it in Stage 1
-- (no builder, no UI, no seed). A cron tick over an empty table selects zero rows
-- and is a genuine no-op. Stages 2-3 add the authoring surface and watcher
-- recipes that populate it.
--
-- REPLAY-SAFE: create-only (table + indexes + trigger + RLS + policies). No data
-- backfill, no SET NOT NULL over existing rows, so a from-zero replay on an empty
-- database succeeds (unlike the 0066 fragility, D-217).
--
-- DEPLOY ORDERING: nothing outside the (not-yet-built) scheduling surface
-- references this table, so the rest of the app is byte-identical whether or not
-- this is applied. Depends on workflow_definitions + workflow_runs (0060).
-- ============================================================================

create table public.workflow_schedules (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  workflow_definition_id  uuid not null references public.workflow_definitions (id) on delete cascade,
  -- The human this schedule's runs are attributed to: every spawned run sets
  -- workflow_runs.triggered_by = owner_user_id (option 2c), so the owner's own
  -- RLS admits the run's pause/approve/resume/read with no policy change. NOT
  -- NULL: a schedule must have an owner to attribute runs to.
  -- FOLLOW-UP (Stage 2/3, deferred): reassign/disable a schedule when its owner
  -- is deactivated. Not built here (users are soft-deactivated, not deleted).
  owner_user_id           uuid not null references public.users (id) on delete cascade,
  enabled                 boolean not null default true,
  -- The next time this schedule is due. The due-query is `enabled and
  -- next_run_at <= now()`; a tick CLAIMS a schedule by conditionally advancing
  -- this (the at-most-once idiom), so a duplicate/overlapping tick can't double-run.
  next_run_at             timestamptz not null,
  -- Cadence as an INTEGER NUMBER OF SECONDS, deliberately chosen over a cron
  -- expression: the next fire is a trivial now() + cadence with no cron-parser
  -- dependency (none is installed, and watcher cadences are coarse: daily+).
  cadence_seconds         integer not null check (cadence_seconds > 0),
  -- The autonomy the spawned runs use (mirrors workflow_runs.autonomy_level,
  -- 0061). Even 'autonomous' runs still pause before any write.
  autonomy_level          text not null default 'supervised'
                            check (autonomy_level in ('supervised', 'autonomous')),
  run_input               jsonb,
  last_run_at             timestamptz,
  -- Points at the most recent run this schedule spawned; set-null on run delete
  -- so run-history pruning never orphans the pointer into a dangling FK.
  last_run_id             uuid references public.workflow_runs (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.workflow_schedules is
  'A cadence for a workflow definition: run it for owner_user_id every cadence_seconds. A cron tick selects due rows (enabled and next_run_at <= now()) and drives each through the headless run core, attributing every run to owner_user_id (workflow_runs.triggered_by, option 2c). Ships dark: created empty; Stages 2-3 populate it.';
comment on column public.workflow_schedules.owner_user_id is
  'The human every spawned run is attributed to (workflow_runs.triggered_by). Option 2c: keeps the run owner-scoped so the existing RLS admits the owner''s pause/approve/resume/read with no policy change.';
comment on column public.workflow_schedules.cadence_seconds is
  'Cadence in seconds. Chosen over a cron expression so the next fire is now() + cadence with no cron-parser dependency.';

-- Every FK gets an index (house rule): organization_id, workflow_definition_id,
-- owner_user_id, last_run_id.
create index workflow_schedules_organization_id_idx        on public.workflow_schedules (organization_id);
create index workflow_schedules_workflow_definition_id_idx on public.workflow_schedules (workflow_definition_id);
create index workflow_schedules_owner_user_id_idx          on public.workflow_schedules (owner_user_id);
create index workflow_schedules_last_run_id_idx            on public.workflow_schedules (last_run_id);
-- Backs the due-query (enabled and next_run_at <= now()): a partial index over
-- only the enabled rows keeps the tick O(due-rows).
create index workflow_schedules_due_idx
  on public.workflow_schedules (next_run_at)
  where enabled;

create trigger workflow_schedules_updated_at
  before update on public.workflow_schedules
  for each row execute function public.set_updated_at();

alter table public.workflow_schedules enable row level security;

-- ============================================================================
-- RLS Policies: workflow_schedules
-- ============================================================================
-- Mirrors workflow_definitions_read / _admin_write exactly (org-scoped read,
-- org-admin write). These govern the FUTURE authoring UI (Stage 2). The cron
-- reads + claims via the service-role client, which bypasses RLS (the sanctioned
-- bypass already used for connection_secrets / MCP / usage_events), so it needs
-- no policy. No new policy SHAPE is invented, and no policy on any other table is
-- added, changed, or weakened.

create policy workflow_schedules_read
  on public.workflow_schedules
  for select
  using (
    organization_id = public.current_org_id()
  );

create policy workflow_schedules_admin_write
  on public.workflow_schedules
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
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- table + RLS present
--   select relname, relrowsecurity
--   from pg_class where relname = 'workflow_schedules';
--   -- expect: relrowsecurity = true
--
--   -- policies present (exactly the two org-read / admin-write policies)
--   select polname from pg_policy
--   where polrelid = 'public.workflow_schedules'::regclass order by polname;
--   -- expect: workflow_schedules_admin_write, workflow_schedules_read
--
--   -- the partial due-index exists
--   select indexname from pg_indexes
--   where tablename = 'workflow_schedules' and indexname = 'workflow_schedules_due_idx';
--   -- expect: one row
--
--   -- ships dark: the table is empty
--   select count(*) from public.workflow_schedules;
--   -- expect: 0
-- ============================================================================
