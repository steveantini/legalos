-- ============================================================================
-- legalOS
-- Migration 0016 — Convert six Commercial agents from external to native
--                    (Phase 2, Session 21 — Pattern B)
-- ============================================================================
--
-- The six Commercial-department agents seeded by
-- `supabase/seed/0002_commercial_agents.sql` were originally created with
-- `type='external'` and Gemini placeholder URLs (clicking them in the
-- launchpad opened Gemini in a new tab rather than the in-app chat
-- surface). Session 21 flips them to `type='native'` with placeholder
-- system prompts so they route through `/api/chat` end-to-end.
--
-- Pattern B — canonical departmental agents, not forkable scaffolding.
-- Per architect direction in the Session 21 conversation, the six are
-- canonical departmental agents owned by the Commercial department.
-- They render in a dedicated "Department Agents" section on the
-- launchpad ABOVE Templates and My Agents, and clicking a card routes
-- directly to the chat surface (`/agents/<id>`) rather than to the
-- fork-from-template flow. To produce that routing, this migration
-- ALSO flips `is_template = false` on each row alongside the
-- type/prompt/model swap. Personal AI Workflow Builder (the
-- click-to-fork-and-customize flow) remains a Phase 3 roadmap item;
-- these six are the ship-quality canonical agents that exist
-- independently of that future flow.
--
-- The launchpad query (`getAgentsForDepartmentLaunchpad` in
-- `lib/auth/access.ts`) gains a third bucket — `departmentAgents`,
-- predicated on `is_template = false AND created_by IS NULL` — so
-- system-seeded canonical agents surface in their own section
-- without colliding with user-owned forks (My Agents, predicated on
-- `created_by = userId`). Both code changes ship in the same commit
-- as this migration; applying the migration without the code change
-- (or vice versa) leaves the six agents invisible to the launchpad
-- query, since they'd match neither Templates nor My Agents.
--
-- The six placeholder prompts below give each agent a recognizable
-- persona but are not the final prompt content. Real prompt authoring —
-- informed by playbook content, standard clauses, and customer
-- scenarios — happens in a future content session. Until then,
-- org_admin / dept_admin can refine each agent's prompt through the
-- agent edit UI; the constraint at this session is "no agent in the
-- Commercial launchpad routes to Gemini."
--
-- Schema note (from `agents_native_requires_prompt` in 0001): a row
-- with `type='native'` requires `system_prompt` AND `model` to be
-- NOT NULL. Each UPDATE below flips all five type-related columns
-- atomically; `external_url` is NULLed since it has no meaning for
-- a native agent.
--
-- Idempotence. Each WHERE clause includes `type = 'external'`, so
-- re-running this migration after a partial apply is a no-op — and
-- crucially, it will NOT clobber prompt edits made via the agent UI
-- after this migration runs (those rows are already `type='native'`
-- and won't match the predicate).
--
-- Companion change: `supabase/seed/0002_commercial_agents.sql` is
-- updated in the same commit so a fresh dev re-seed reproduces this
-- post-migration state. Re-seeding does NOT roll back the migration —
-- the seed file's INSERT body and ON CONFLICT DO UPDATE clause both
-- assert the native + non-template shape.
-- ============================================================================

begin;

update public.agents
   set type          = 'native',
       system_prompt = 'You are an enterprise agreement review specialist. Help the user review enterprise sales contracts, identify standard and non-standard terms, flag negotiation points, and suggest redlines. Focus on commercial reasonableness and legal risk.',
       model         = 'anthropic/claude-sonnet-4-6',
       external_url  = null,
       is_template   = false
 where slug = 'enterprise-agreement-review'
   and type = 'external';

update public.agents
   set type          = 'native',
       system_prompt = 'You are a mutual NDA review specialist. Help the user review mutual non-disclosure agreements, identify terms that deviate from market standard, flag overly broad confidentiality obligations, and suggest balanced edits. Focus on reciprocity and clear definitions.',
       model         = 'anthropic/claude-sonnet-4-6',
       external_url  = null,
       is_template   = false
 where slug = 'mutual-nda-review'
   and type = 'external';

update public.agents
   set type          = 'native',
       system_prompt = 'You are an order form and statement of work review specialist. Help the user review order forms and SOWs for commercial sales transactions, verify alignment with the master agreement, identify pricing or scope ambiguity, and flag terms that conflict with standard playbook positions.',
       model         = 'anthropic/claude-sonnet-4-6',
       external_url  = null,
       is_template   = false
 where slug = 'order-form-sow-review'
   and type = 'external';

update public.agents
   set type          = 'native',
       system_prompt = 'You are a vendor agreement review specialist representing the buy-side. Help the user review vendor and supplier contracts, identify risk-shifting provisions, flag unfavorable indemnification or limitation of liability terms, and suggest negotiation positions that protect the buyer''s interests.',
       model         = 'anthropic/claude-sonnet-4-6',
       external_url  = null,
       is_template   = false
 where slug = 'vendor-agreement-review'
   and type = 'external';

update public.agents
   set type          = 'native',
       system_prompt = 'You are a DPA review specialist. Help the user review data processing addenda for compliance with GDPR, CCPA, and other applicable privacy laws. Focus on data subject rights, sub-processor terms, security obligations, and breach notification requirements.',
       model         = 'anthropic/claude-sonnet-4-6',
       external_url  = null,
       is_template   = false
 where slug = 'dpa-review'
   and type = 'external';

update public.agents
   set type          = 'native',
       system_prompt = 'You are an AI addendum review specialist. Help the user review AI-related contract terms covering training data rights, model output ownership, hallucination disclaimers, indemnification carve-outs for AI use, and acceptable use restrictions. Focus on emerging risk areas where standard contract language hasn''t yet stabilized.',
       model         = 'anthropic/claude-sonnet-4-6',
       external_url  = null,
       is_template   = false
 where slug = 'ai-addendum-review'
   and type = 'external';

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back; the seed file would also
-- need reverting in tandem since `0002_commercial_agents.sql` was
-- updated alongside this migration to assert the native shape on
-- re-seed). Restores the pre-Session-21 external state with the
-- original Gemini placeholder URLs.
--
-- begin;
-- update public.agents
--    set type          = 'external',
--        system_prompt = null,
--        model         = null,
--        is_template   = true,
--        external_url  = 'https://gemini.google.com/gem/placeholder-enterprise-agreement-review'
--  where slug = 'enterprise-agreement-review' and type = 'native';
-- update public.agents
--    set type          = 'external',
--        system_prompt = null,
--        model         = null,
--        is_template   = true,
--        external_url  = 'https://gemini.google.com/gem/placeholder-mutual-nda-review'
--  where slug = 'mutual-nda-review' and type = 'native';
-- update public.agents
--    set type          = 'external',
--        system_prompt = null,
--        model         = null,
--        is_template   = true,
--        external_url  = 'https://gemini.google.com/gem/placeholder-order-form-sow-review'
--  where slug = 'order-form-sow-review' and type = 'native';
-- update public.agents
--    set type          = 'external',
--        system_prompt = null,
--        model         = null,
--        is_template   = true,
--        external_url  = 'https://gemini.google.com/gem/placeholder-vendor-agreement-review'
--  where slug = 'vendor-agreement-review' and type = 'native';
-- update public.agents
--    set type          = 'external',
--        system_prompt = null,
--        model         = null,
--        is_template   = true,
--        external_url  = 'https://gemini.google.com/gem/placeholder-dpa-review'
--  where slug = 'dpa-review' and type = 'native';
-- update public.agents
--    set type          = 'external',
--        system_prompt = null,
--        model         = null,
--        is_template   = true,
--        external_url  = 'https://gemini.google.com/gem/placeholder-ai-addendum-review'
--  where slug = 'ai-addendum-review' and type = 'native';
-- commit;
-- ============================================================================
