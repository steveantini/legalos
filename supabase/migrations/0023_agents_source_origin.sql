-- ============================================================================
-- legalOS
-- Migration 0023 — Add source_origin provenance column to agents
-- ============================================================================
--
-- Adds a nullable `source_origin` column to `public.agents` as the
-- foundation for multi-source agent provenance. The first non-native
-- source is Claude for Legal; the field accommodates future sources
-- (Stanford CodeX, firm-internal libraries, etc.) without further
-- schema changes.
--
-- Native legalOS agents (Canonical templates created by admins,
-- Personal agents created by users) have `source_origin = NULL`.
--
-- Externally-sourced agents store a string of the form
-- "<source-id>:<plugin>/<skill>", e.g.:
--   "claude-for-legal:commercial-legal/vendor-agreement-review"
--   "claude-for-legal:privacy-legal/dsar-response"
--
-- The prefix before the colon identifies the source for UI attribution
-- (rendered as a "Claude for Legal" badge, etc.); the path after the
-- colon identifies the specific upstream item for sync purposes. Future
-- sources extend the prefix vocabulary without further schema changes.
--
-- Externally-sourced agents are created exclusively by the sync
-- pipeline. The existing createAgentAction and createTemplateAgentAction
-- server actions continue to produce NULL-source agents only — no app
-- code change ships with this migration.
--
-- Index is partial (WHERE source_origin IS NOT NULL) since the majority
-- of rows are expected to be native (NULL) for the foreseeable future;
-- a full index would inflate cost for the dominant case.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Re-running this migration is a no-op.
-- ============================================================================

begin;

alter table public.agents
  add column if not exists source_origin text;

create index if not exists agents_source_origin_idx
  on public.agents (source_origin)
  where source_origin is not null;

comment on column public.agents.source_origin is
  'Provenance for externally-sourced agents. Format: "<source-id>:<plugin>/<skill>". NULL for legalOS-native agents (Canonical and Personal).';

commit;

-- ============================================================================
-- Reverse:
--
-- begin;
--   drop index if exists public.agents_source_origin_idx;
--   alter table public.agents drop column if exists source_origin;
-- commit;
-- ============================================================================
