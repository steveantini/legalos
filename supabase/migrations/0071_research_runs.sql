-- ============================================================================
-- 0071_research_runs.sql
-- Knowledge arc Step 2 — the research engine: runs, findings, and the
-- usage-ledger attribution
-- ============================================================================
--
-- A research run is one institutional question asked across chosen
-- collections: the engine enumerates the scope live, reads each document
-- where it lives, classifies it with the model in batches, and synthesizes a
-- cited answer. What persists here is the RUN RECORD and PER-DOCUMENT
-- FINDINGS (determinations, excerpts, citations) — never document content,
-- consistent with the Step-1 inventory-only promise.
--
-- Three changes:
--   * research_runs          — the run: question, scope snapshot, status,
--                              progress, cursor, answer, usage rollup.
--   * research_run_findings  — one row per document inspected (or honestly
--                              failed), upserted idempotently per segment.
--   * usage_events           — gains research_run_id; agent_id relaxes to
--                              NULLABLE (the workflow_run_id precedent,
--                              0060): research model calls have no agent.
--                              The platform Cost views aggregate usage_events
--                              org-wide with no agent join, and the Insights
--                              reader already types agent_id as nullable, so
--                              research spend flows into cost analytics with
--                              no view changes.
--
-- Also: organizations.research_document_cap — the per-run document cap
-- (default 200), super-admin-adjustable from Policy & access (the
-- default_model precedent).
--
-- RUN VISIBILITY (the deliberate choice): the asking user reads their own
-- runs; org_admin and super_admin read the organization's runs. This mirrors
-- the conversations stance the Trust pages state (work product belongs to
-- the organization; plain users do not see each other's work). Writes are
-- owner-only — the engine advances a run as the user who asked.
--
-- ORDERING + IDEMPOTENCY (the 0070 lesson): tables first, then policies;
-- IF NOT EXISTS / drop-then-create policies throughout, so a partial apply
-- reruns cleanly. Apply in the Supabase SQL Editor.
-- ============================================================================


-- ============================================================================
-- PART 1 — Tables and columns
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: research_runs
-- ----------------------------------------------------------------------------

create table if not exists public.research_runs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  -- on delete restrict, like usage_events: the run is org work product and a
  -- cost record; deleting a user must not silently erase it.
  user_id             uuid not null references public.users (id) on delete restrict,
  question            text not null,
  -- The chosen collections at start: [{ id, name, provenance: [display paths] }].
  scope               jsonb not null default '[]'::jsonb,
  -- The live-enumerated document list the run will read (ids/titles/sources),
  -- snapshotted for auditability: the answer's basis is exactly this list.
  documents_snapshot  jsonb not null default '[]'::jsonb,
  status              text not null default 'planning'
                        check (status in ('planning', 'running', 'synthesizing',
                                          'completed', 'failed', 'cancelled')),
  -- Why a failed run failed (user-safe message); null otherwise.
  failure_reason      text,
  documents_total     integer not null default 0,
  documents_processed integer not null default 0,
  documents_failed    integer not null default 0,
  -- Documents excluded up front as unreadable types (reported in the basis).
  skipped_unsupported integer not null default 0,
  -- The classification rubric the planning call produced.
  rubric              text,
  -- Segment cursor (resume state), engine-owned.
  cursor              jsonb,
  answer              text,
  -- Citations in the established sources idiom: [{ id, title, url, domain }].
  citations           jsonb not null default '[]'::jsonb,
  -- The honest basis line ("Read N documents across X; M could not be read.").
  basis               text,
  tokens_in           bigint not null default 0,
  tokens_out          bigint not null default 0,
  cost_micro_usd      bigint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists research_runs_organization_id_idx
  on public.research_runs (organization_id, created_at);
create index if not exists research_runs_user_id_idx
  on public.research_runs (user_id, created_at);

drop trigger if exists research_runs_updated_at on public.research_runs;
create trigger research_runs_updated_at
  before update on public.research_runs
  for each row execute function public.set_updated_at();

alter table public.research_runs enable row level security;

-- ----------------------------------------------------------------------------
-- Table: research_run_findings
-- ----------------------------------------------------------------------------
-- One row per document the sweep inspected — or honestly could not: a fetch
-- failure or truncated read is a finding with its own status, so the answer
-- can state its basis ("3 documents could not be read") and nothing is
-- silently dropped. Upserted on (run_id, external_id), so a re-run segment
-- after an interruption never duplicates findings.

create table if not exists public.research_run_findings (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.research_runs (id) on delete cascade,
  external_id        text not null,
  title              text not null default '',
  source_url         text,
  -- Collection/source display provenance ("Commercial contracts · Google Drive / …").
  provenance         text not null default '',
  -- Whether the document answered the question's rubric.
  relevant           boolean,
  -- The per-document substance (what the model determined about this document).
  determination      text not null default '',
  supporting_excerpt text not null default '',
  status             text not null default 'ok'
                       check (status in ('ok', 'fetch_failed', 'read_incomplete')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists research_run_findings_run_external_idx
  on public.research_run_findings (run_id, external_id);

drop trigger if exists research_run_findings_updated_at on public.research_run_findings;
create trigger research_run_findings_updated_at
  before update on public.research_run_findings
  for each row execute function public.set_updated_at();

alter table public.research_run_findings enable row level security;

-- ----------------------------------------------------------------------------
-- usage_events: research attribution (the workflow_run_id precedent, 0060)
-- ----------------------------------------------------------------------------

-- Research model calls have no agent. Existing writers always supply
-- agent_id, so relaxing the constraint changes nothing for them; the
-- analytics readers already tolerate null (the Cost views aggregate without
-- an agent join; Insights types agent_id as nullable and guards).
alter table public.usage_events
  alter column agent_id drop not null;

alter table public.usage_events
  add column if not exists research_run_id uuid references public.research_runs (id) on delete set null;

create index if not exists usage_events_research_run_id_idx
  on public.usage_events (research_run_id)
  where research_run_id is not null;

-- ----------------------------------------------------------------------------
-- organizations: the per-run document cap (super-admin governance)
-- ----------------------------------------------------------------------------

alter table public.organizations
  add column if not exists research_document_cap integer not null default 200
    check (research_document_cap between 1 and 5000);

comment on column public.organizations.research_document_cap is
  'Maximum documents one research run may read. Default 200; super-admin-adjustable in Policy & access. Over-cap scopes are declined honestly before running, never silently truncated.';


-- ============================================================================
-- PART 2 — RLS policies (after every table they reference)
-- ============================================================================

-- Read: own runs, plus org/super admins read the organization's runs (work
-- product belongs to the organization — the conversations stance).
drop policy if exists research_runs_read_own_or_admin on public.research_runs;
create policy research_runs_read_own_or_admin
  on public.research_runs
  for select
  using (
    organization_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or public.current_user_role() in ('super_admin', 'org_admin')
    )
  );

-- Write: the asking user only (the engine advances the run as them).
drop policy if exists research_runs_owner_write on public.research_runs;
create policy research_runs_owner_write
  on public.research_runs
  for all
  using (
    organization_id = public.current_org_id()
    and user_id = auth.uid()
  )
  with check (
    organization_id = public.current_org_id()
    and user_id = auth.uid()
  );

-- Findings follow the parent run exactly: the subquery runs under the
-- caller's RLS on research_runs, so visibility composes with no second rule.
drop policy if exists research_run_findings_read_via_run on public.research_run_findings;
create policy research_run_findings_read_via_run
  on public.research_run_findings
  for select
  using (
    exists (
      select 1 from public.research_runs r where r.id = run_id
    )
  );

drop policy if exists research_run_findings_owner_write on public.research_run_findings;
create policy research_run_findings_owner_write
  on public.research_run_findings
  for all
  using (
    exists (
      select 1
        from public.research_runs r
       where r.id = run_id
         and r.user_id = auth.uid()
         and r.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1
        from public.research_runs r
       where r.id = run_id
         and r.user_id = auth.uid()
         and r.organization_id = public.current_org_id()
    )
  );


-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Tables exist with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public'
--       and tablename in ('research_runs', 'research_run_findings');
--    -- expect: 2 rows, rowsecurity = true.
--
-- 2. Policies present:
--    select tablename, policyname from pg_policies
--     where tablename like 'research%' order by tablename, policyname;
--    -- expect: a read and an owner write policy per table.
--
-- 3. usage_events attribution:
--    select column_name, is_nullable from information_schema.columns
--     where table_name = 'usage_events'
--       and column_name in ('agent_id', 'research_run_id');
--    -- expect: agent_id is_nullable = YES; research_run_id present.
--
-- 4. The cap:
--    select research_document_cap from public.organizations limit 1;
--    -- expect: 200 (default) on existing rows.
