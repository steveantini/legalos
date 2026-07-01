-- ============================================================================
-- 20260701130000_watcher_findings.sql
-- Watcher arc, Stage 2 — the findings a watcher produces (MOSTLY DARK)
-- ============================================================================
--
-- A watcher (a scheduled workflow, Stage 1) produces FINDINGS: one row per HIT
-- (decision 1b — three expiring agreements is three findings, each individually
-- addressable), each about a specific (subject, event) pair created ONCE
-- (decision 2 — subsequent ticks that observe the same fact never duplicate).
-- Idempotency is a natural-key UNIQUE + upsert-on-conflict-do-nothing.
--
-- SHIPS DARK: findings land in the DB, but NO Desk card, NO gallery, NO
-- user-facing surface reads this table in Stage 2 (Stage 3 merges these into the
-- Desk via the pre-architected sourceType:'finding' discriminator — this
-- migration does not touch any Desk table). `is_fixture` (decision 3ii) marks
-- fixture-derived rows so sample data stays structurally separable and sweepable
-- when real dogfooding data lands (delete where is_fixture).
--
-- The cron writes findings via the SERVICE-ROLE client (the sanctioned RLS
-- bypass, same as Stage 1). The RLS below (org read / admin write) governs the
-- future user/admin surfaces (Stage 3); it mirrors workflow_definitions exactly
-- and adds NO policy to any other table.
--
-- REPLAY-SAFE: create-only. Depends on organizations, workflow_schedules
-- (20260701120000), workflow_runs (0060).
-- ============================================================================

create table public.watcher_findings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  -- Which watcher produced this finding.
  schedule_id      uuid not null references public.workflow_schedules (id) on delete cascade,
  -- Which run surfaced it. Nullable + set-null on delete so a finding survives
  -- run-history cleanup (the finding is the durable artifact, the run is not).
  run_id           uuid references public.workflow_runs (id) on delete set null,
  -- The natural key (with organization_id + schedule_id): finding_kind names the
  -- watcher family ('renewal'); subject_ref is the stable identifier of the thing
  -- the finding is about (e.g. the agreement's document id); event_key is the
  -- specific observed event ('expires_2026-08-15'). The same observation on a
  -- later tick collides on the UNIQUE below and is a no-op.
  finding_kind     text not null,
  subject_ref      text not null,
  event_key        text not null,
  title            text not null,
  body             text,
  status           text not null default 'open'
                     check (status in ('open', 'dismissed', 'resolved')),
  -- Decision 3ii: fixture-derived rows are structurally separable + sweepable.
  is_fixture       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- The idempotency key: a finding is a specific (org, watcher, kind, subject,
  -- event) fact, created once. The run writes via upsert-on-conflict-do-nothing.
  constraint watcher_findings_natural_key
    unique (organization_id, schedule_id, finding_kind, subject_ref, event_key)
);

comment on table public.watcher_findings is
  'One row per watcher HIT (decision 1b). Idempotent on the (org, schedule, finding_kind, subject_ref, event_key) natural key (decision 2): a repeated observation upserts to nothing. Ships dark; Stage 3 surfaces these in the Desk (sourceType:''finding''). is_fixture marks sample data for sweeping.';
comment on column public.watcher_findings.subject_ref is
  'Stable identifier of the entity the finding is about (e.g. the agreement''s document id), so a later tick observing the same fact reuses the same finding.';
comment on column public.watcher_findings.event_key is
  'The specific observed event (e.g. ''expires_2026-08-15''). A changed fact (a new expiry date) is a new event_key, hence a new finding — not a silent overwrite.';

create index watcher_findings_organization_id_idx on public.watcher_findings (organization_id);
create index watcher_findings_schedule_id_idx     on public.watcher_findings (schedule_id);
create index watcher_findings_run_id_idx          on public.watcher_findings (run_id);
-- Backs the future Desk query ("this org's open findings"): a partial index over
-- only the open rows keeps that read cheap as dismissed/resolved rows accumulate.
create index watcher_findings_open_idx
  on public.watcher_findings (organization_id, status)
  where status = 'open';

create trigger watcher_findings_updated_at
  before update on public.watcher_findings
  for each row execute function public.set_updated_at();

alter table public.watcher_findings enable row level security;

-- ============================================================================
-- RLS: mirrors workflow_definitions_read / _admin_write exactly (org read, admin
-- write). Governs the future Stage 3 surfaces; the cron writes via service role.
-- No policy SHAPE is invented, and no policy on any other table is touched.
-- ============================================================================

create policy watcher_findings_read
  on public.watcher_findings
  for select
  using (
    organization_id = public.current_org_id()
  );

create policy watcher_findings_admin_write
  on public.watcher_findings
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
-- Verification (SQL Editor after applying):
--   select relrowsecurity from pg_class where relname = 'watcher_findings';
--   -- expect: true
--   select conname from pg_constraint
--   where conrelid = 'public.watcher_findings'::regclass and contype = 'u';
--   -- expect: watcher_findings_natural_key
--   select count(*) from public.watcher_findings;  -- expect: 0 (ships dark)
-- ============================================================================
