-- ============================================================================
-- 0060_workflows.sql
-- Workflows arc, Step 2 — the workflow data model + execution audit trail
-- ============================================================================
--
-- A workflow in legalOS is DECLARATIVE STEP-GRAPH DATA, not UI-form-state or
-- imperative code. A definition is a serializable graph (jsonb) that a human
-- composer authors today and a future orchestrator agent could emit tomorrow —
-- both pass the SAME data-boundary validator before they run. The engine that
-- walks a definition is separate from the definition itself (definition vs.
-- execution), so the agentic layer is additive: it produces definitions; this
-- same engine runs them.
--
-- Three tables:
--   workflow_definitions — the authored step graph (versioned, org/dept-scoped).
--   workflow_runs        — one execution, with the definition SNAPSHOTTED at run
--                          time so later edits to the definition never mutate
--                          historical runs (the audit trail reflects what ran).
--   workflow_step_runs   — ONE IMMUTABLE ROW PER STEP EXECUTION: input, output,
--                          status, timing, error. The legally-required per-step
--                          audit trail (modeled on the C4L per-handoff audit log).
--
-- Plus: usage_events gains a nullable workflow_run_id so an agent-step's cost
-- (already recorded by runAgent) is attributable to the workflow run it ran in.
--
-- DEPLOY ORDERING: nothing outside the Workflows surface references these tables,
-- so the rest of the app is byte-identical whether or not this is applied. The
-- engine + the startWorkflowRun action require these tables; apply BEFORE running
-- a workflow. Apply in the Supabase SQL Editor (the project's standard path).
-- Self-contained: creates the three tables, their RLS, and the usage_events
-- column in dependency order.
-- ============================================================================


-- ============================================================================
-- Table: workflow_definitions
-- ============================================================================
-- The authored step graph. `definition` jsonb holds { steps: Step[] } where each
-- Step carries a STABLE id (so a future edges/next map can reference step ids for
-- branching without a migration) and a `type` tag (agent | tool_action |
-- human_checkpoint, with router representable later). Order is array order for
-- the linear v1; branching is an additive `edges` overlay on this same jsonb.

create table public.workflow_definitions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  -- A workflow may be org-wide (null) or scoped to one department (read-gated by
  -- has_department_access when set, like agents).
  department_id    uuid references public.departments (id) on delete restrict,
  name             text not null,
  description      text,
  version          integer not null default 1,
  status           text not null default 'draft'
                     check (status in ('draft', 'active', 'archived')),
  -- The declarative step graph. Validated at the data boundary before any run.
  definition       jsonb not null default '{"steps": []}'::jsonb,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.workflow_definitions is
  'An authored workflow as a declarative step-graph (jsonb). Org-scoped, optionally department-scoped. Separate from execution: the engine runs a snapshot of this, and a future orchestrator agent could emit the same validated graph a human composer does.';
comment on column public.workflow_definitions.definition is
  'The step graph: { steps: Step[] }. Each step has a stable id + a type tag (agent | tool_action | human_checkpoint). v1 executes steps in array order (linear); branching is an additive edges/next overlay keyed by step id, representable here with no migration.';

create index workflow_definitions_organization_id_idx on public.workflow_definitions (organization_id);
create index workflow_definitions_department_id_idx    on public.workflow_definitions (department_id);
create index workflow_definitions_created_by_idx       on public.workflow_definitions (created_by);

create trigger workflow_definitions_updated_at
  before update on public.workflow_definitions
  for each row execute function public.set_updated_at();

alter table public.workflow_definitions enable row level security;


-- ============================================================================
-- Table: workflow_runs
-- ============================================================================
-- One execution of a definition. definition_snapshot freezes the graph AT run
-- time, so editing (or deleting) the definition later never changes what this
-- run records — the audit trail is faithful to what actually ran.

create table public.workflow_runs (
  id                      uuid primary key default gen_random_uuid(),
  -- Nullable + set-null on delete: a run outlives its definition (the snapshot is
  -- the source of truth), so deleting a definition preserves run history.
  workflow_definition_id  uuid references public.workflow_definitions (id) on delete set null,
  -- The frozen graph this run executed (immutable to later definition edits).
  definition_snapshot     jsonb not null,
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  -- The user who started the run (v1: manual start). Later: trigger metadata.
  triggered_by            uuid references public.users (id) on delete set null,
  run_input               jsonb,
  status                  text not null default 'pending'
                            check (status in ('pending', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  error                   text,
  started_at              timestamptz,
  finished_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.workflow_runs is
  'One execution of a workflow definition. definition_snapshot freezes the graph at run time so later definition edits never mutate historical runs. Org-scoped; owned by the triggering user (RLS), org admins read.';
comment on column public.workflow_runs.definition_snapshot is
  'The exact step graph this run executed, copied at run start. The engine runs THIS, not the live definition, so the run + its step audit trail are immutable to subsequent edits of workflow_definitions.definition.';

create index workflow_runs_workflow_definition_id_idx on public.workflow_runs (workflow_definition_id);
create index workflow_runs_organization_id_idx        on public.workflow_runs (organization_id);
create index workflow_runs_triggered_by_idx           on public.workflow_runs (triggered_by);

create trigger workflow_runs_updated_at
  before update on public.workflow_runs
  for each row execute function public.set_updated_at();

alter table public.workflow_runs enable row level security;


-- ============================================================================
-- Table: workflow_step_runs
-- ============================================================================
-- ONE ROW PER STEP EXECUTION — the per-step audit trail. Carries the resolved
-- input, the produced output, status, timing, and any error. Written once by the
-- engine in v1 (the immutable record); Step 3 (human checkpoints) will update an
-- 'awaiting_approval' row on resume, which is why updated_at exists.

create table public.workflow_step_runs (
  id               uuid primary key default gen_random_uuid(),
  workflow_run_id  uuid not null references public.workflow_runs (id) on delete cascade,
  -- The stable step id from the definition graph (NOT a FK — the graph lives in
  -- jsonb; the snapshot on the run is the source of truth for what the id means).
  step_id          text not null,
  step_type        text not null
                     check (step_type in ('agent', 'tool_action', 'human_checkpoint')),
  status           text not null
                     check (status in ('pending', 'running', 'awaiting_approval', 'completed', 'failed', 'skipped')),
  -- The resolved input this step consumed and the output it produced (jsonb so a
  -- string agent answer or a structured tool result both fit). PII lives here as
  -- it does in messages — same tenant trust boundary, RLS-scoped to the owner.
  input            jsonb,
  output           jsonb,
  error            text,
  -- Execution order within the run (0-based), so the trail renders in sequence.
  sequence         integer not null,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.workflow_step_runs is
  'One immutable row per step execution — the per-step audit trail (modeled on the C4L per-handoff audit log). Input/output/status/timing/error for every step the engine ran. Scoped (RLS) to the owner of the parent run; org admins read.';

create index workflow_step_runs_workflow_run_id_idx on public.workflow_step_runs (workflow_run_id);

create trigger workflow_step_runs_updated_at
  before update on public.workflow_step_runs
  for each row execute function public.set_updated_at();

alter table public.workflow_step_runs enable row level security;


-- ============================================================================
-- usage_events.workflow_run_id — cost attribution for agent-steps
-- ============================================================================
-- runAgent already writes a usage_events row per agent-step. This nullable column
-- ties that cost to the workflow run it ran in, so workflow cost is traceable.
-- Null for ordinary (non-workflow) runAgent calls and all chat usage.

alter table public.usage_events
  add column workflow_run_id uuid references public.workflow_runs (id) on delete set null;

comment on column public.usage_events.workflow_run_id is
  'The workflow run this usage was incurred in (agent-step cost), or null for chat / non-workflow runAgent calls. Set-null on run delete so cost history is never orphaned into a dangling FK.';

create index usage_events_workflow_run_id_idx on public.usage_events (workflow_run_id);


-- ============================================================================
-- RLS Policies: workflow_definitions
-- ============================================================================
-- Read: org members can read definitions in their org, dept-scoped when the
-- definition is department-scoped (mirrors agents' department gating). Authoring
-- (create / edit / archive) is an org-admin action.

create policy workflow_definitions_read
  on public.workflow_definitions
  for select
  using (
    organization_id = public.current_org_id()
    and (department_id is null or public.has_department_access(department_id))
  );

create policy workflow_definitions_admin_write
  on public.workflow_definitions
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
-- RLS Policies: workflow_runs
-- ============================================================================
-- The triggering user owns their run (read + write); org admins read all runs in
-- their org. Mirrors conversations / mcp_paused_runs.

create policy workflow_runs_owner
  on public.workflow_runs
  for all
  using (triggered_by = auth.uid())
  with check (
    triggered_by = auth.uid()
    and organization_id = public.current_org_id()
  );

create policy workflow_runs_admin_read
  on public.workflow_runs
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- RLS Policies: workflow_step_runs
-- ============================================================================
-- Gated through the parent run: the run's owner has full access to its step rows;
-- org admins read step rows for runs in their org. A user can never see another
-- user's step runs.

create policy workflow_step_runs_owner
  on public.workflow_step_runs
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

create policy workflow_step_runs_admin_read
  on public.workflow_step_runs
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
--   -- tables + RLS present
--   select relname, relrowsecurity
--   from pg_class
--   where relname in ('workflow_definitions', 'workflow_runs', 'workflow_step_runs')
--   order by relname;
--   -- expect: relrowsecurity = true for all three
--
--   -- policies present
--   select polrelid::regclass as table, polname
--   from pg_policy
--   where polrelid in (
--     'public.workflow_definitions'::regclass,
--     'public.workflow_runs'::regclass,
--     'public.workflow_step_runs'::regclass
--   )
--   order by 1, 2;
--   -- expect: workflow_definitions_admin_write, workflow_definitions_read,
--   --         workflow_runs_admin_read, workflow_runs_owner,
--   --         workflow_step_runs_admin_read, workflow_step_runs_owner
--
--   -- usage_events cost-attribution column present
--   select column_name from information_schema.columns
--   where table_name = 'usage_events' and column_name = 'workflow_run_id';
--   -- expect: one row
--
--   -- immutability: definition_snapshot is not null (every run freezes its graph)
--   select column_name, is_nullable from information_schema.columns
--   where table_name = 'workflow_runs' and column_name = 'definition_snapshot';
--   -- expect: is_nullable = NO
-- ============================================================================
