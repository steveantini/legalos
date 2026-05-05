-- ============================================================================
-- legalOS
-- Migration 0014 — messages.sources + messages.tool_calls
--                   (Phase 2, Session 18 Step A)
-- ============================================================================
--
-- Adds two jsonb columns to public.messages so future steps in Session 18
-- can persist citation source records and tool invocation records on the
-- assistant row. Step A is schema-only — no application code changes, no
-- backfill, no RLS changes (the new columns inherit message-level RLS from
-- 0004_native_agents.sql).
--
-- Both columns default to an empty jsonb array so existing rows (and any
-- user-role rows, which never carry sources / tool_calls) read as [] rather
-- than null. This lets downstream code treat the columns as always-present
-- arrays without null-guards.
--
-- Idempotence: ADD COLUMN IF NOT EXISTS. Re-running this migration after a
-- partial apply is a no-op.
-- ============================================================================

alter table public.messages
  add column if not exists sources jsonb not null default '[]'::jsonb;

alter table public.messages
  add column if not exists tool_calls jsonb not null default '[]'::jsonb;

comment on column public.messages.sources is
  'Array of citation source objects: { id, title, url, domain, fetched_at? }. Populated when the agent uses tools that produce citations (e.g. web_search). Empty array when no sources.';

comment on column public.messages.tool_calls is
  'Array of tool invocation records: { id, name, input, output, status, started_at, finished_at, error? }. Populated when the agent invokes tools during the turn. Empty array when no tools used.';

-- ============================================================================
-- Reverse:
--   alter table public.messages drop column if exists sources;
--   alter table public.messages drop column if exists tool_calls;
-- ============================================================================
