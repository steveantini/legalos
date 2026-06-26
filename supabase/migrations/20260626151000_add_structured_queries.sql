-- ============================================================================
-- 20260626151000_add_structured_queries.sql
-- Structured Query (phase one), commit 5 — the persisted asked-question artifact.
-- ============================================================================
--
-- WHY. The question surface is built on a deliberate division of labor: a model
-- TRANSLATES the user's plain-language question into the structured-query IR
-- (commit 4), and the PURE engine EXECUTES that IR deterministically. Because
-- the translation can vary, it must be made transparent and AUDITABLE: this
-- table persists, for each asked question, the original question, the model's
-- interpreted query (the IR), a plain-language summary of that interpretation,
-- and a snapshot of the engine's result. Re-running the stored IR over the
-- current data is byte-identical by construction (the engine is pure), so a
-- count is always reproducible and a reader can see exactly what was asked of
-- the engine. This is the structured-query sibling of research_runs: a per-ask
-- record, owned by the asker, readable by org admins.
--
-- THE MODEL PROPOSES, THE ENGINE DISPOSES, THE USER SEES THE BRIDGE.
-- interpreted_query holds the IR the engine actually ran; interpreted_summary
-- is its human rendering ("Counting documents where Agreement type is NDA"),
-- shown to the user so the model's reading is never hidden. understood = false
-- records an honest GAP: the question referenced something the schema does not
-- track (missing_concept names it) — no query ran. This is the seam phase two
-- upgrades to "want me to start tracking that?" (schema-grows-on-demand): the
-- gap is a stored, first-class outcome, not an error.
--
-- BACK-COMPAT. Additive table; the read/write paths tolerate its absence (the
-- pre-migration window) exactly as commits 2 and 3 do, so the surface degrades
-- to "no history yet" rather than failing if this has not been applied.
-- ============================================================================

create table if not exists public.structured_queries (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  -- The asker. Owns the row (RLS); org admins may also read it.
  user_id               uuid not null references public.users (id) on delete cascade,
  -- The collection the question was asked over (its schema supplies the fields).
  collection_id         uuid not null references public.collections (id) on delete cascade,
  -- The user's plain-language question, verbatim.
  question              text not null,
  -- A human rendering of the interpreted query, shown for transparency.
  interpreted_summary   text not null default '',
  -- The structured-query IR the engine ran (commit 4 shape), or null for a gap.
  interpreted_query     jsonb,
  -- False records an honest GAP (the question named a field the schema lacks);
  -- no query ran. The phase-two seam: this becomes a track-it offer later.
  understood            boolean not null default true,
  -- The unmapped concept, when understood = false (the gap's subject).
  missing_concept       text,
  -- A snapshot of the engine result (commit 4 StructuredQueryResult), or null
  -- for a gap. Auditable; re-running the IR over current data reproduces it.
  result                jsonb,
  -- Denormalized headline counts, so the history list renders without parsing
  -- the result jsonb. Null for a gap.
  matched_count         integer,
  total_count           integer,
  -- The collection's preparation state at ask time, recorded so a later reader
  -- knows whether the answer rested on fully-prepared or stale data.
  preparation_state     text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- History list, newest-first, per org and per asker.
create index if not exists structured_queries_org_created_idx
  on public.structured_queries (organization_id, created_at desc);
create index if not exists structured_queries_user_created_idx
  on public.structured_queries (user_id, created_at desc);
-- FK index for the collection pointer.
create index if not exists structured_queries_collection_idx
  on public.structured_queries (collection_id);

drop trigger if exists structured_queries_updated_at on public.structured_queries;
create trigger structured_queries_updated_at
  before update on public.structured_queries
  for each row execute function public.set_updated_at();

alter table public.structured_queries enable row level security;

-- Read: the asker reads their own questions; super_admin / org_admin read the
-- organization's (the work product belongs to the org, mirroring research_runs
-- and the conversations posture). Org-scoped throughout.
drop policy if exists structured_queries_read on public.structured_queries;
create policy structured_queries_read
  on public.structured_queries
  for select
  using (
    organization_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or public.current_user_role() in ('super_admin', 'org_admin')
    )
  );

-- Write: the asker owns their rows (insert / update / delete), inside their own
-- org. A member may ask; an admin reads but does not author another member's
-- questions. The with_check binds the row to the caller and their org.
drop policy if exists structured_queries_owner_write on public.structured_queries;
create policy structured_queries_owner_write
  on public.structured_queries
  for all
  using (
    organization_id = public.current_org_id()
    and user_id = auth.uid()
  )
  with check (
    organization_id = public.current_org_id()
    and user_id = auth.uid()
  );

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Table exists with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename = 'structured_queries';
--    -- expect: 1 row, rowsecurity = true.
--
-- 2. Policies present:
--    select policyname from pg_policies where tablename = 'structured_queries';
--    -- expect: structured_queries_read, structured_queries_owner_write.
--
-- 3. Indexes present:
--    select indexname from pg_indexes where tablename = 'structured_queries';
--    -- expect: the pkey, structured_queries_org_created_idx,
--    --         structured_queries_user_created_idx,
--    --         structured_queries_collection_idx.
--
-- 4. The updated_at trigger is attached:
--    select tgname from pg_trigger
--     where tgrelid = 'public.structured_queries'::regclass and not tgisinternal;
--    -- expect: structured_queries_updated_at.
