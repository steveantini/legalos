-- ============================================================================
-- legalOS
-- Migration — messages.pre_step_result (Document Comparison redline persistence)
-- ============================================================================
--
-- FIRST migration authored through the tracked Supabase CLI workflow (DECISION
-- LOG D-193). The 76 historical files (0001..0076) keep their sequential
-- NNNN_name.sql names as the canonical baseline; new migrations follow the CLI's
-- timestamped YYYYMMDDHHMMSS_name.sql convention from here on, so the ledger and
-- the file order agree going forward.
--
-- WHAT THIS STORES
-- Adds a single nullable jsonb column, pre_step_result, to public.messages. It
-- holds the structured ComparisonResult produced by a deterministic PRE-STEP
-- (today only Document Comparison, D-188/D-189): the same authoritative change
-- set that drove both the model's prose and the live visual redline. Persisting
-- it lets the redline survive a page reload — without it, a reloaded comparison
-- message degrades to prose only, because the redline previously arrived solely
-- on the live `pre_step_redline` SSE event and was never stored.
--
-- The persisted value is the SINGLE SOURCE OF TRUTH on reload: the renderer
-- rehydrates and re-renders it verbatim and NEVER recomputes a diff (D-189).
--
-- WHY NULLABLE, NO DEFAULT, NO BACKFILL
-- pre_step_result is meaningful only on the assistant turn of a pre-step agent.
-- The overwhelming majority of messages (every user row, every ordinary
-- assistant row) have no pre-step result, and NULL is the honest representation
-- of "this turn had none" — distinct from 0014's sources/tool_calls, which
-- default to an empty array because every assistant turn conceptually has a
-- (possibly empty) list. There is nothing to backfill: historical comparison
-- turns predate the redline and have no stored change set to recover.
--
-- SAFE UNDER LIVE TRAFFIC
-- Additive, nullable, no default → a catalog-only change (Postgres does not
-- rewrite the table or touch existing rows), so it takes a brief lock and is
-- safe to apply on the hot-path messages table while it serves traffic. The new
-- column inherits message-level RLS from 0004_native_agents.sql; no policy
-- change is needed.
--
-- Idempotence: ADD COLUMN IF NOT EXISTS. Re-running after a partial apply is a
-- no-op. The application code reads and writes this column DEFENSIVELY (it
-- tolerates the column being briefly absent), so the deploy and this migration
-- can land in either order without breaking chat.
-- ============================================================================

alter table public.messages
  add column if not exists pre_step_result jsonb;

comment on column public.messages.pre_step_result is
  'Structured result of a deterministic pre-step on this assistant turn (today: Document Comparison''s ComparisonResult/RedlinePayload — segments, summary, truncated, originalLabel, revisedLabel). The same authoritative change set that drove the prose and the live redline; persisted so the visual redline survives reload and is re-rendered verbatim, never recomputed. NULL on every turn with no pre-step (all user rows and ordinary assistant rows).';

-- ============================================================================
-- Reverse:
--   alter table public.messages drop column if exists pre_step_result;
-- ============================================================================
