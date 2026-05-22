-- ============================================================================
-- legalOS
-- Migration 0033 — Reorder departments to reflect the new four-group
--                   taxonomy
-- ============================================================================
--
-- Reshuffles sort_order on the existing 9 departments to align with a
-- four-group taxonomy:
--
--   1. Deal & transactional work       — Commercial, Corporate
--   2. Regulatory & compliance         — (Regulatory, follow-up commit),
--                                        Public Sector, Compliance, Privacy
--   3. Specialized practice areas      — Product, Employment
--   4. Operational & utility           — Operations, General Tools
--                                        (always-last per commit 7eb776b)
--
-- Position 3 is intentionally left vacant. The follow-up commit will
-- insert the new Regulatory department at sort_order 3 without
-- needing to re-shuffle other departments.
--
-- Movement summary:
--   commercial      1 → 1 (no change)
--   corporate       3 → 2
--   public-sector   2 → 4
--   compliance      6 → 5
--   privacy         4 → 6
--   product         5 → 7
--   employment      7 → 8
--   operations      8 → 9
--   general-tools   9 → 10
--
-- Two-phase shuffle: move all reordered rows to temporary high values
-- (102+), then move each down to its final value. The column has no
-- UNIQUE constraint today so a single-phase update would also work,
-- but the two-phase approach treats sort_order as logically unique
-- and stays robust if the schema ever tightens.
--
-- Schema impact: zero. Only sort_order changes. UUIDs, FKs, agent
-- attachments, RLS policies — all unchanged.
--
-- Idempotent: re-running rewrites the same sort_order values with
-- fresh updated_at. The two-phase shuffle is also re-run-safe; the
-- temp values are well above any realistic real-world sort_order.
-- ============================================================================

begin;

-- Phase 1: move all reordered rows to temporary high sort_order values
-- to avoid transient conflicts during the shuffle.
update public.departments set sort_order = 102, updated_at = now() where slug = 'corporate';
update public.departments set sort_order = 104, updated_at = now() where slug = 'public-sector';
update public.departments set sort_order = 105, updated_at = now() where slug = 'compliance';
update public.departments set sort_order = 106, updated_at = now() where slug = 'privacy';
update public.departments set sort_order = 107, updated_at = now() where slug = 'product';
update public.departments set sort_order = 108, updated_at = now() where slug = 'employment';
update public.departments set sort_order = 109, updated_at = now() where slug = 'operations';
update public.departments set sort_order = 110, updated_at = now() where slug = 'general-tools';

-- Phase 2: move each row to its final position.
update public.departments set sort_order = 2,  updated_at = now() where slug = 'corporate';
update public.departments set sort_order = 4,  updated_at = now() where slug = 'public-sector';
update public.departments set sort_order = 5,  updated_at = now() where slug = 'compliance';
update public.departments set sort_order = 6,  updated_at = now() where slug = 'privacy';
update public.departments set sort_order = 7,  updated_at = now() where slug = 'product';
update public.departments set sort_order = 8,  updated_at = now() where slug = 'employment';
update public.departments set sort_order = 9,  updated_at = now() where slug = 'operations';
update public.departments set sort_order = 10, updated_at = now() where slug = 'general-tools';

-- Commercial stays at sort_order 1 — no update needed.
-- Sort_order 3 is intentionally left vacant; the next migration
-- inserts the Regulatory department there.

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back the reorder). Restores the
-- pre-0033 state:
--   commercial=1, public-sector=2, corporate=3, privacy=4, product=5,
--   compliance=6, employment=7, operations=8, general-tools=9.
--
-- begin;
-- -- Phase 1: temp values
-- update public.departments set sort_order = 102, updated_at = now() where slug = 'corporate';
-- update public.departments set sort_order = 104, updated_at = now() where slug = 'public-sector';
-- update public.departments set sort_order = 105, updated_at = now() where slug = 'privacy';
-- update public.departments set sort_order = 106, updated_at = now() where slug = 'product';
-- update public.departments set sort_order = 107, updated_at = now() where slug = 'compliance';
-- update public.departments set sort_order = 108, updated_at = now() where slug = 'employment';
-- update public.departments set sort_order = 109, updated_at = now() where slug = 'operations';
-- update public.departments set sort_order = 110, updated_at = now() where slug = 'general-tools';
-- -- Phase 2: restore previous positions
-- update public.departments set sort_order = 3, updated_at = now() where slug = 'corporate';
-- update public.departments set sort_order = 2, updated_at = now() where slug = 'public-sector';
-- update public.departments set sort_order = 4, updated_at = now() where slug = 'privacy';
-- update public.departments set sort_order = 5, updated_at = now() where slug = 'product';
-- update public.departments set sort_order = 6, updated_at = now() where slug = 'compliance';
-- update public.departments set sort_order = 7, updated_at = now() where slug = 'employment';
-- update public.departments set sort_order = 8, updated_at = now() where slug = 'operations';
-- update public.departments set sort_order = 9, updated_at = now() where slug = 'general-tools';
-- commit;
-- ============================================================================
