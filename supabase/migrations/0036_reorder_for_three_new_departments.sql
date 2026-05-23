-- ============================================================================
-- legalOS
-- Migration 0036 — Reorder departments to reserve three slots for
--                   AI Governance, IP, and Litigation
-- ============================================================================
--
-- Reshuffles sort_order to reserve three positions for new departments
-- that land in the follow-up commit:
--
--   - Position 7  — AI Governance  (Regulatory & compliance cluster,
--                                   following Privacy at 6)
--   - Position 10 — IP             (Specialized practice areas cluster,
--                                   following Employment at 9)
--   - Position 11 — Litigation     (Specialized practice areas cluster,
--                                   following IP at 10)
--
-- Movement summary (4 of 10 departments shift):
--   product:       7 → 8
--   employment:    8 → 9
--   operations:    9 → 12
--   general-tools: 10 → 13
--
-- Six departments stay put (commercial 1, corporate 2, regulatory 3,
-- public-sector 4, compliance 5, privacy 6).
--
-- Resulting sort_order map (post-migration, with vacant slots):
--   1  commercial
--   2  corporate
--   3  regulatory
--   4  public-sector
--   5  compliance
--   6  privacy
--   7  (vacant — AI Governance lands here in the follow-up)
--   8  product
--   9  employment
--   10 (vacant — IP lands here in the follow-up)
--   11 (vacant — Litigation lands here in the follow-up)
--   12 operations
--   13 general-tools
--
-- Two-phase shuffle (move to temp values 108–113, then to final
-- values 8 / 9 / 12 / 13) — robust against any future UNIQUE
-- constraint on sort_order even though the column has none today.
-- Same pattern as commit 4404ffc (migration 0033).
--
-- Schema impact: zero. UUIDs, FKs, agent attachments, RLS policies —
-- all unchanged. Operations and General Tools keep their always-last-
-- in-that-order positioning (now at 12 and 13 instead of 9 and 10)
-- per the rule established in commit 7eb776b.
--
-- Idempotent: re-running rewrites the same sort_order values with a
-- fresh updated_at. The two-phase shuffle is also re-run-safe.
-- ============================================================================

begin;

-- Phase 1: move reordered rows to temporary high sort_order values
-- to avoid transient conflicts during the shuffle.
update public.departments set sort_order = 108, updated_at = now() where slug = 'product';
update public.departments set sort_order = 109, updated_at = now() where slug = 'employment';
update public.departments set sort_order = 112, updated_at = now() where slug = 'operations';
update public.departments set sort_order = 113, updated_at = now() where slug = 'general-tools';

-- Phase 2: move each row to its final position.
update public.departments set sort_order = 8,  updated_at = now() where slug = 'product';
update public.departments set sort_order = 9,  updated_at = now() where slug = 'employment';
update public.departments set sort_order = 12, updated_at = now() where slug = 'operations';
update public.departments set sort_order = 13, updated_at = now() where slug = 'general-tools';

-- Positions 7, 10, 11 intentionally left vacant for the follow-up
-- commit which inserts AI Governance, IP, and Litigation.

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back the reservation). Restores
-- the pre-0036 state: product=7, employment=8, operations=9,
-- general-tools=10.
--
-- begin;
-- update public.departments set sort_order = 108, updated_at = now() where slug = 'product';
-- update public.departments set sort_order = 109, updated_at = now() where slug = 'employment';
-- update public.departments set sort_order = 112, updated_at = now() where slug = 'operations';
-- update public.departments set sort_order = 113, updated_at = now() where slug = 'general-tools';
-- update public.departments set sort_order = 7,  updated_at = now() where slug = 'product';
-- update public.departments set sort_order = 8,  updated_at = now() where slug = 'employment';
-- update public.departments set sort_order = 9,  updated_at = now() where slug = 'operations';
-- update public.departments set sort_order = 10, updated_at = now() where slug = 'general-tools';
-- commit;
-- ============================================================================
