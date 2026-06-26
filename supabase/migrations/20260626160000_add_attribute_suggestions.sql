-- ============================================================================
-- 20260626160000_add_attribute_suggestions.sql
-- Structured Query PHASE TWO — schema-grows-on-demand: the suggestion record.
-- ============================================================================
--
-- WHY. Phase one (commits 1-5) ended on an honest GAP: when a question asks
-- about a field the collection does not track, the surface names what it DOES
-- track and stops. Phase two upgrades that seam into a flow: a member SUGGESTS
-- tracking the missing field, a model DRAFTS the attribute definition, an admin
-- REVIEWS / EDITS / APPROVES it, and on approval the attribute is added to the
-- collection's schema (commit 2's validated path) and extracted by the existing
-- reconcile (commit 3) on the next deliberate Update. This table is the
-- first-class record of that suggestion as it moves pending → approved/rejected.
--
-- NO NEW EXTRACTION OR QUERY MACHINERY. Approving an attribute simply bumps the
-- schema version (commit 2), which by commit 3's DERIVED staleness makes every
-- document stale FOR THAT NEW ATTRIBUTE ONLY (a new attribute has no extraction
-- rows, so `isPairStale` returns true for every document). The collection then
-- reads "needs updating"; the admin runs Update, and the reconcile extracts only
-- the new attribute. Querying it afterwards rides the existing pure engine. So
-- this migration adds one suggestion table and nothing else schema-wise.
--
-- THE APPROVAL BOUNDARY IS A CODE GATE, NOT THIS TABLE. Who may approve is a
-- single, cleanly-changeable function (`canApproveSchemaSuggestion`,
-- lib/knowledge/schema-suggestions-shared.ts), so the operator can tweak the
-- rule (trusted members self-approving, a per-collection rule) in ONE place. The
-- approve/reject server action enforces that gate and performs the gated schema
-- write with the service role, so loosening the gate never requires touching
-- RLS. The RLS below is the honest baseline (read for anyone who can see the
-- collection; suggest as yourself; super-admin backstop on resolve), defense in
-- depth beneath the code gate.
--
-- BACK-COMPAT. Additive table; the reads/writes tolerate its absence (the
-- pre-migration window), exactly as the phase-one tables do.
-- ============================================================================

create table if not exists public.attribute_suggestions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  collection_id         uuid not null references public.collections (id) on delete cascade,
  -- The member who suggested it (owns the row on insert).
  suggested_by_user_id  uuid not null references public.users (id) on delete cascade,
  -- The question that hit the gap, and the concept it asked about (commit 5).
  source_question       text not null,
  missing_concept       text not null,
  -- The model's DRAFT attribute definition, then the admin's edited version on
  -- approval: { label, type, description, options? } — the commit-2 attribute
  -- shape minus the key (the key is derived at approval, label-edit-safe).
  proposed              jsonb not null,
  status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  -- Who approved or rejected (the actor), and when approved, the stable key the
  -- attribute received in the schema (for the loop-close + dedup).
  resolved_by_user_id   uuid references public.users (id) on delete set null,
  resulting_attribute_key text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- The admin's pending queue per collection, and the per-org / per-suggester lists.
create index if not exists attribute_suggestions_collection_status_idx
  on public.attribute_suggestions (collection_id, status);
create index if not exists attribute_suggestions_org_created_idx
  on public.attribute_suggestions (organization_id, created_at desc);
create index if not exists attribute_suggestions_user_created_idx
  on public.attribute_suggestions (suggested_by_user_id, created_at desc);

drop trigger if exists attribute_suggestions_updated_at on public.attribute_suggestions;
create trigger attribute_suggestions_updated_at
  before update on public.attribute_suggestions
  for each row execute function public.set_updated_at();

alter table public.attribute_suggestions enable row level security;

-- Read: anyone in the org who can SEE the collection (composes collection
-- visibility, like the phase-one query reads). Members see suggestions for
-- their visible collections; admins see them to act on them.
drop policy if exists attribute_suggestions_read_for_visible_collection on public.attribute_suggestions;
create policy attribute_suggestions_read_for_visible_collection
  on public.attribute_suggestions
  for select
  using (
    organization_id = public.current_org_id()
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
    )
  );

-- Insert (suggest): a member writes their OWN suggestion for a collection they
-- can see. The with_check binds the row to the caller and a visible collection.
drop policy if exists attribute_suggestions_member_suggest on public.attribute_suggestions;
create policy attribute_suggestions_member_suggest
  on public.attribute_suggestions
  for insert
  with check (
    organization_id = public.current_org_id()
    and suggested_by_user_id = auth.uid()
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
    )
  );

-- Resolve (approve / reject): super-admin baseline backstop. The operative
-- authority is the `canApproveSchemaSuggestion` code gate, which the approve
-- action enforces before performing the resolve + schema write with the service
-- role, so a future loosened gate needs no RLS change. This policy stops a
-- direct (non-action) client from tampering.
drop policy if exists attribute_suggestions_admin_resolve on public.attribute_suggestions;
create policy attribute_suggestions_admin_resolve
  on public.attribute_suggestions
  for update
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  );

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Table exists with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename = 'attribute_suggestions';
--    -- expect: 1 row, rowsecurity = true.
--
-- 2. Policies present:
--    select policyname, cmd from pg_policies
--     where tablename = 'attribute_suggestions' order by policyname;
--    -- expect: attribute_suggestions_admin_resolve (UPDATE),
--    --         attribute_suggestions_member_suggest (INSERT),
--    --         attribute_suggestions_read_for_visible_collection (SELECT).
--
-- 3. Indexes present:
--    select indexname from pg_indexes where tablename = 'attribute_suggestions';
--    -- expect: the pkey, attribute_suggestions_collection_status_idx,
--    --         attribute_suggestions_org_created_idx,
--    --         attribute_suggestions_user_created_idx.
--
-- 4. The updated_at trigger is attached:
--    select tgname from pg_trigger
--     where tgrelid = 'public.attribute_suggestions'::regclass and not tgisinternal;
--    -- expect: attribute_suggestions_updated_at.
