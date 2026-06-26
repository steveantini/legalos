-- ============================================================================
-- 20260626170000_add_feedback.sql
-- In-product feedback foundation (Step One) — the stored feedback object.
-- ============================================================================
--
-- WHY. Any authenticated user, from anywhere in the app, can send a short note
-- (a bug, an idea, a confusion). Each note is a first-class STORED OBJECT with a
-- status, reviewed by the PLATFORM OWNER across all customers. This mirrors the
-- proven attribute_suggestions shape (user-inserts-own / status / admin-resolves),
-- with one deliberate difference: review is PLATFORM-LEVEL (cross-org), so the
-- owner's read does NOT go through a user RLS SELECT policy. There is no
-- is_platform_owner() SQL function, and the established cross-org read pattern
-- (the operator_* analytics views, migrations 0067/0068) reads via the
-- SERVICE-ROLE admin client behind requirePlatformOwner() in code. So:
--   * INSERT  — user RLS, insert-own (any authenticated user, their own row).
--   * SELECT  — SELF-READ only at the RLS layer (a user may see their OWN notes);
--               the platform owner's cross-org queue reads via service-role.
--   * triage  — status changes are done via service-role in a platform-owner-
--               gated server action; no user UPDATE policy exists.
--
-- NO NOTIFICATION HERE. Step two attaches a notify-the-owner hook to the single
-- insert server action (the one write path); nothing email/notification is built
-- now. The additive CS-layer columns (resolver, resolution) exist but their
-- workflow (assignment, filtering, reply, themes) is deferred.
--
-- BACK-COMPAT. Additive table; reads/writes tolerate its absence (the
-- pre-migration window), as the Structured Query tables do.
-- ============================================================================

create table if not exists public.feedback (
  id                    uuid primary key default gen_random_uuid(),
  -- The submitter (owns the row on insert; can self-read).
  created_by_user_id    uuid not null references public.users (id) on delete cascade,
  -- The submitter's org. Stored even though review is platform-level, so a
  -- future per-org triage view is purely additive (no migration).
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  -- The user's words (the only thing they must type).
  message               text not null,
  -- A light, OPTIONAL type; defaults to 'other' when the user does not pick one.
  kind                  text not null default 'other'
                          check (kind in ('bug', 'idea', 'confusion', 'other')),
  -- Server-stamped auto-context (route, role, userAgent, app commit, ...).
  -- jsonb so new capture fields need no migration. Keep secrets/PII out.
  context               jsonb not null default '{}',
  status                text not null default 'new'
                          check (status in ('new', 'seen', 'in_progress', 'resolved', 'wont_fix')),
  -- Additive CS-layer resolution fields (nullable now; the workflow is deferred).
  resolved_by_user_id   uuid references public.users (id) on delete set null,
  resolution_note       text,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- The triage queue + the unseen ('new') count, newest first.
create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);
-- A future per-org triage view.
create index if not exists feedback_org_created_idx
  on public.feedback (organization_id, created_at desc);
-- A user's own submissions (the self-read path).
create index if not exists feedback_created_by_created_idx
  on public.feedback (created_by_user_id, created_at desc);

drop trigger if exists feedback_updated_at on public.feedback;
create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

alter table public.feedback enable row level security;

-- Insert: any authenticated user writes their OWN note, stamped to their org.
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own
  on public.feedback
  for insert
  with check (
    created_by_user_id = auth.uid()
    and organization_id = public.current_org_id()
  );

-- Self-read: a user may see their own submissions (feedback is held and
-- respected). The platform owner's cross-org review deliberately does NOT use a
-- user SELECT policy; it reads via the service-role admin client behind
-- requirePlatformOwner() (the operator-analytics pattern). No platform/org
-- SELECT policy is added here on purpose.
drop policy if exists feedback_read_own on public.feedback;
create policy feedback_read_own
  on public.feedback
  for select
  using (created_by_user_id = auth.uid());

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Table exists with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename = 'feedback';
--    -- expect: 1 row, rowsecurity = true.
--
-- 2. Policies present (insert-own + self-read; NO cross-org SELECT):
--    select policyname, cmd from pg_policies
--     where tablename = 'feedback' order by policyname;
--    -- expect: feedback_insert_own (INSERT), feedback_read_own (SELECT).
--
-- 3. Indexes present:
--    select indexname from pg_indexes where tablename = 'feedback';
--    -- expect: the pkey, feedback_status_created_idx, feedback_org_created_idx,
--    --         feedback_created_by_created_idx.
--
-- 4. The updated_at trigger is attached:
--    select tgname from pg_trigger
--     where tgrelid = 'public.feedback'::regclass and not tgisinternal;
--    -- expect: feedback_updated_at.
