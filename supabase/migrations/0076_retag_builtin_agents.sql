-- 0076_retag_builtin_agents.sql
--
-- Re-tag the built-in first-party system agents from the brand-coupled identity
-- (slug `legalos-system-<skill>`, source_origin `legalos:system/<skill>`) to the
-- brand-neutral identity (slug `builtin-<skill>`, source_origin
-- `builtin:tools/<skill>`). Part of the brand-decoupling arc (D-182): the tier's
-- internal token becomes `builtin` so a future product rename touches NO data.
--
-- This UPDATES the EXISTING rows in place, matched by their OLD source_origin, so
-- no rows are inserted and none are orphaned. The renamed seeder
-- (`npm run seed-builtin-agents`) must run AFTER this migration: it then matches
-- all rows by the new identity and reports unchanged (no inserts).
--
-- Safety:
--   * Idempotent + safe to re-run: after the update, no row matches
--     `source_origin LIKE 'legalos:system/%'`, so a second run is a no-op.
--   * Safe no-op on environments with no built-in rows (the WHERE matches none).
--   * Touches ONLY the canonical tier (source_origin LIKE 'legalos:system/%').
--     User forks have source_origin NULL and a different slug, and Claude for
--     Legal rows are `claude-for-legal:%`, so neither is ever matched.
--   * The skill segment is preserved verbatim (extracted from the old
--     source_origin), so the five skills map old->new exactly.
--   * No other table references these agents by slug or source_origin
--     (usage_events / forks reference agents.id, which is unchanged), so the
--     re-tag breaks no foreign references.

update public.agents
   set slug = 'builtin-' || substring(source_origin from 'legalos:system/(.*)'),
       source_origin = 'builtin:tools/' || substring(source_origin from 'legalos:system/(.*)'),
       updated_at = now()
 where source_origin like 'legalos:system/%';
