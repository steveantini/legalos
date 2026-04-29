-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0006 — Agents extensions + usage_events cache columns
--                   (Phase 2 implementation, Session 8e)
-- ============================================================================
--
-- Adds five new columns to public.agents and two new columns to
-- public.usage_events, per docs/AGENT_ARCHITECTURE.md §schema-sketch and
-- the Phase 2 implementation phasing item #2:
--
--   public.agents:
--     is_template            boolean       — flips a row into template mode
--     forked_from_agent_id   uuid          — provenance for forked user agents
--     tools_enabled          jsonb         — bounded list of enabled tool ids
--     default_output_format  text          — 'markdown' | 'docx' (CHECK enforced)
--     deleted_at             timestamptz   — soft-delete timestamp (null = active)
--
--   public.usage_events:
--     cache_creation_tokens  integer       — tokens written into cache on call
--     cache_read_tokens      integer       — tokens read from cache on call
--
-- The six seeded Commercial agents (slugs 'enterprise-agreement-review',
-- 'mutual-nda-review', 'order-form-sow-review', 'vendor-agreement-review',
-- 'dpa-review', 'ai-addendum-review') are flipped to is_template = true by
-- the targeted UPDATE near the bottom. The Test Smoke Agent stays at
-- is_template = false from the column default; the seed file documents
-- that explicitly so a fresh fork is unambiguous.
--
-- Idempotence: every change uses IF NOT EXISTS / DROP-IF-EXISTS / IS DISTINCT
-- FROM patterns so re-applying this migration is a no-op. The CHECK
-- constraint is wrapped in a pg_constraint lookup because Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS.
--
-- No application code reads the new columns yet; the runtime continues to
-- function unchanged. Subsequent Phase 2 sessions exercise these columns
-- for agent CRUD, attached references, prompt caching, and exports.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- public.agents — five new columns
-- ----------------------------------------------------------------------------

alter table public.agents
  add column if not exists is_template boolean not null default false;

alter table public.agents
  add column if not exists forked_from_agent_id uuid
    references public.agents (id) on delete set null;

alter table public.agents
  add column if not exists tools_enabled jsonb not null default '[]'::jsonb;

alter table public.agents
  add column if not exists default_output_format text not null default 'markdown';

alter table public.agents
  add column if not exists deleted_at timestamptz;

-- CHECK constraint on default_output_format. Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS, so guard with a pg_constraint lookup.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'agents_default_output_format_check'
       and conrelid = 'public.agents'::regclass
  ) then
    alter table public.agents
      add constraint agents_default_output_format_check
      check (default_output_format in ('markdown', 'docx'));
  end if;
end $$;

-- Indexes for common query patterns:
--   is_template — "show me all templates" on the launchpad templates section.
--   (organization_id, department_id, sort_order) where deleted_at is null —
--     the active-agents launchpad query (the existing
--     agents_organization_id_idx and agents_department_id_idx from 0001
--     remain; this partial composite covers the deleted_at predicate).
create index if not exists agents_is_template_idx
  on public.agents (is_template);

create index if not exists agents_active_idx
  on public.agents (organization_id, department_id, sort_order)
  where deleted_at is null;

-- ----------------------------------------------------------------------------
-- public.usage_events — cache token columns for prompt-caching cost tracking
-- ----------------------------------------------------------------------------
-- Both NOT NULL DEFAULT 0. Existing rows from Sessions 8a/8b predate caching
-- and will read 0 tokens; the prompt-caching wiring session populates real
-- values once cache markers are wired in the Anthropic adapter.

alter table public.usage_events
  add column if not exists cache_creation_tokens integer not null default 0;

alter table public.usage_events
  add column if not exists cache_read_tokens integer not null default 0;

-- ----------------------------------------------------------------------------
-- Mark the six seeded Commercial agents as templates
-- ----------------------------------------------------------------------------
-- Idempotent via "is_template is distinct from true" — re-running this
-- statement after the rows are already flipped is a no-op.

update public.agents
   set is_template = true
 where slug in (
   'enterprise-agreement-review',
   'mutual-nda-review',
   'order-form-sow-review',
   'vendor-agreement-review',
   'dpa-review',
   'ai-addendum-review'
 )
   and is_template is distinct from true;

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back).
-- ============================================================================
--
-- begin;
--   alter table public.usage_events drop column if exists cache_read_tokens;
--   alter table public.usage_events drop column if exists cache_creation_tokens;
--
--   drop index if exists public.agents_active_idx;
--   drop index if exists public.agents_is_template_idx;
--
--   alter table public.agents drop constraint if exists agents_default_output_format_check;
--
--   alter table public.agents drop column if exists deleted_at;
--   alter table public.agents drop column if exists default_output_format;
--   alter table public.agents drop column if exists tools_enabled;
--   alter table public.agents drop column if exists forked_from_agent_id;
--   alter table public.agents drop column if exists is_template;
-- commit;
-- ============================================================================
