-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0011 — usage_events.web_search_count
--                   (Phase 2 implementation, Session 8j)
-- ============================================================================
--
-- Adds the per-call web-search count to the cost ledger. Each search
-- counts as one use regardless of how many results return; failed
-- searches are not billed (per Anthropic's web search docs). Cost is
-- $10 per 1,000 searches, model-agnostic — pricing.ts holds the rate.
--
-- NOT NULL DEFAULT 0 so existing rows from 8a/8b/8h record 0 (no
-- web search before this session). The chat route persists the
-- usage.server_tool_use.web_search_requests value from Anthropic's
-- response usage block on every assistant message.
--
-- Idempotence: ADD COLUMN IF NOT EXISTS. Re-running this migration
-- after a partial apply is a no-op.
-- ============================================================================

alter table public.usage_events
  add column if not exists web_search_count integer not null default 0;

-- ============================================================================
-- Reverse:
--   alter table public.usage_events drop column if exists web_search_count;
-- ============================================================================
