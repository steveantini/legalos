-- ============================================================================
-- legalOS
-- Migration 0018 — users.welcomed_at (Phase 2, Session 21)
-- ============================================================================
--
-- Adds a nullable timestamp column to `public.users` that records when
-- the user first saw the welcome hero on the workspace landing.
--
-- Semantics:
--   - NULL — user has not yet seen the welcome variant. The next
--     authenticated request to `/` (workspace landing) renders the
--     welcome hero ("Welcome to legalOS, …") AND fires an UPDATE that
--     populates this column with `now()`.
--   - NOT NULL — user has been welcomed. The landing renders the
--     greeting variant (time-based "Good morning/afternoon/evening,
--     <name>." plus persistent tagline subline) instead.
--
-- The state is one-shot, not reset on subsequent logins — we welcome a
-- user ONCE per account lifetime, not once per session. If a future
-- product decision wants a re-welcome (e.g., after a major redesign),
-- a follow-up migration can NULL out the column (full or filtered).
--
-- No backfill: existing user rows have welcomed_at = NULL by default,
-- so every existing user sees the welcome variant on their next request
-- after this migration applies. This is intentional — pre-Session-21
-- users were never welcomed by this surface, and a single welcome on
-- their next visit is the cleanest way to introduce it.
--
-- Idempotence: ADD COLUMN IF NOT EXISTS. Re-running this migration
-- after a partial apply is a no-op.
-- ============================================================================

begin;

alter table public.users
  add column if not exists welcomed_at timestamptz;

commit;

-- ============================================================================
-- Reverse:
--   begin;
--   alter table public.users drop column if exists welcomed_at;
--   commit;
-- ============================================================================
