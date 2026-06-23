-- ============================================================================
-- 0075_desk_feeds.sql
-- Desk feeds v1 — personal "my feeds": per-user content sources (Substack,
-- podcasts, news, any RSS/Atom) the workspace-home Desk renders as latest-item
-- cards.
-- ============================================================================
--
-- One table: desk_feeds. A row is ONE content source a user added by URL. It
-- stores the source reference (feed_url, resolved site_url and title) plus a
-- CACHE of that feed's latest item (title, link, date, image, podcast
-- duration), refreshed server-side on a TTL so the Desk renders from cache and
-- never fetches per page load.
--
-- OWNER-SCOPED, ORG-FENCED RLS: a user reads and writes only their OWN feeds,
-- and only within their own organization. A single FOR ALL policy expresses
-- that — there is no shared/org-visible read for personal feeds, so no second
-- policy is needed. The org fence (organization_id = current_org_id()) is
-- defense in depth: even though user_id = auth.uid() already pins ownership,
-- the org predicate means a row can never be planted into or read across
-- another organization, consistent with the D-136 connection-scoping posture.
--
-- THE FUTURE LAYER (admin-curated, role-scoped Desk content) IS ARCHITECTED FOR
-- BUT NOT BUILT. The Desk's read path returns a view model carrying a
-- `sourceType` discriminator ('personal' today). When admin-curated role
-- content ships, it lands as a SIBLING table (e.g. desk_curated_feeds:
-- org-scoped, role/department-targeted, admin-written, its own RLS) that the
-- Desk loader merges ALONGSIDE personal feeds into the same card view model.
-- That is purely additive: a new table + a new loader branch + the existing
-- union, with NO reshape of this table, its RLS, or the card component. This
-- table stays exactly what it is: the personal half. We deliberately do not
-- add admin/role columns here now, so the personal model stays minimal and the
-- two layers compose as siblings rather than as overloaded modes of one table.
--
-- The per-user feed CAP (12) is enforced in the server action at insert, where
-- the live count is known, not as a table constraint.
--
-- IDEMPOTENT throughout (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF
-- EXISTS): a partially applied earlier attempt does not block a rerun.
--
-- Apply in the Supabase SQL Editor (the project's standard path).
-- ============================================================================


-- ============================================================================
-- PART 1 — Table
-- ============================================================================

create table if not exists public.desk_feeds (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.users (id) on delete cascade,
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  -- The feed reference and resolved display fields.
  feed_url                 text not null,
  site_url                 text,
  title                    text not null default '',
  -- CACHE of the feed's latest item, refreshed server-side on a TTL (never per
  -- render). Nullable until the first fetch resolves.
  cached_item_title        text,
  cached_item_url          text,
  cached_item_published_at timestamptz,
  cached_image_url         text,
  -- Podcast episode length in seconds when the feed carries it; null otherwise.
  cached_duration_seconds  integer,
  -- 'pending' until the first fetch resolves; 'ok' or 'error' after. An 'error'
  -- feed keeps its row and renders a calm "couldn't load" card, never breaking
  -- the Desk.
  fetch_status             text not null default 'pending'
                             check (fetch_status in ('pending', 'ok', 'error')),
  last_fetched_at          timestamptz,
  -- Append order; the Desk renders by this then added_at.
  sort_order               integer not null default 0,
  added_at                 timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- One source per user (dedupe on the normalized feed_url the action stores).
create unique index if not exists desk_feeds_user_feed_url_key
  on public.desk_feeds (user_id, feed_url);

-- The Desk's per-user ordered read.
create index if not exists desk_feeds_user_order_idx
  on public.desk_feeds (user_id, sort_order, added_at);

drop trigger if exists desk_feeds_updated_at on public.desk_feeds;
create trigger desk_feeds_updated_at
  before update on public.desk_feeds
  for each row execute function public.set_updated_at();

alter table public.desk_feeds enable row level security;


-- ============================================================================
-- PART 2 — RLS: a user manages only their own feeds, within their own org
-- ============================================================================

-- Owner-scoped for every command (select / insert / update / delete). The org
-- fence is belt-and-suspenders alongside the ownership check.
drop policy if exists desk_feeds_owner_manages_own on public.desk_feeds;
create policy desk_feeds_owner_manages_own
  on public.desk_feeds
  for all
  using (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
  )
  with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
  );


-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Table exists with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename = 'desk_feeds';
--    -- expect: 1 row, rowsecurity = true.
--
-- 2. The owner policy is present:
--    select policyname, cmd from pg_policies
--     where tablename = 'desk_feeds';
--    -- expect: desk_feeds_owner_manages_own, cmd = ALL.
--
-- 3. The dedupe key and ordered-read index exist:
--    select indexname from pg_indexes
--     where tablename = 'desk_feeds'
--     order by indexname;
--    -- expect: desk_feeds_user_feed_url_key, desk_feeds_user_order_idx
--    --         (plus the primary key index).
--
-- 4. The updated_at trigger is wired:
--    select tgname from pg_trigger
--     where tgrelid = 'public.desk_feeds'::regclass and not tgisinternal;
--    -- expect: desk_feeds_updated_at.
