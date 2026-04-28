-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0005 — Vendor-prefixed model ids (Phase 2 implementation, Session 8d)
-- ============================================================================
--
-- Rewrites every model id in the runtime tables from the bare Anthropic form
-- (e.g. 'claude-sonnet-4-6') to the vendor-prefixed form
-- ('anthropic/claude-sonnet-4-6'), per docs/AGENT_ARCHITECTURE.md §6 and the
-- Phase 2 implementation phasing item #1. The new format namespaces every
-- model id by vendor so the same column can later hold OpenAI / Google ids
-- without a parallel column or a guess-the-vendor heuristic.
--
-- Three columns hold model ids today:
--   - public.agents.model            (nullable; populated for native agents only)
--   - public.conversations.model_snapshot
--   - public.usage_events.model
--
-- Idempotence: the WHERE clause excludes already-prefixed values
-- (`NOT LIKE '%/%'`). The slash-based check is forward-compatible — any future
-- vendor (`openai/...`, `google/...`) is caught by the same predicate, so
-- re-running this migration after a different vendor lands in production data
-- does not double-prefix.
--
-- Cutover note: the application code in lib/llm/parse-model-id.ts includes a
-- bare-id fallback that accepts both prefixed and bare forms during the
-- migration window, so applying this migration before or after the new code
-- deploys does not produce a chat outage. Cost tracking briefly records 0 if
-- the new code runs against bare data (MODEL_PRICING is keyed on prefixed
-- ids; computeCostMicroUsd throws on lookup miss, route catches and logs).
--
-- Reversibility: a commented inverse block is included at the bottom of this
-- file for any future operator who needs to roll back. This repo does not use
-- a CLI that applies down-migrations.
-- ============================================================================

begin;

update public.agents
   set model = 'anthropic/' || model
 where type = 'native'
   and model is not null
   and model not like '%/%';

update public.conversations
   set model_snapshot = 'anthropic/' || model_snapshot
 where model_snapshot not like '%/%';

update public.usage_events
   set model = 'anthropic/' || model
 where model not like '%/%';

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back). Strips the 'anthropic/' prefix
-- from every row that has it. Forward-compatible with non-Anthropic vendors:
-- rows prefixed 'openai/...' or 'google/...' are left alone.
-- ============================================================================
--
-- begin;
--   update public.agents
--      set model = substring(model from position('/' in model) + 1)
--    where model like 'anthropic/%';
--   update public.conversations
--      set model_snapshot = substring(model_snapshot from position('/' in model_snapshot) + 1)
--    where model_snapshot like 'anthropic/%';
--   update public.usage_events
--      set model = substring(model from position('/' in model) + 1)
--    where model like 'anthropic/%';
-- commit;
