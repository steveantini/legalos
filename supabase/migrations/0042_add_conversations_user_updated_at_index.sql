-- ============================================================================
-- Migration 0042 — conversations(user_id, updated_at) index
-- ============================================================================
--
-- Supports the "Continue working" section on the personalized workspace home
-- (/workspace), which lists each user's most recently active conversations.
-- Pairs with app/api/chat/route.ts now bumping conversations.updated_at on each
-- message insert, so updated_at reflects genuine last activity rather than
-- staying frozen at conversation-creation time.
--
-- Index-only change: no RLS, seed, or data impact.
-- ============================================================================

create index if not exists conversations_user_id_updated_at_idx
  on public.conversations (user_id, updated_at desc);

comment on index public.conversations_user_id_updated_at_idx is
  'Supports the "Continue working" home section: most recently active conversations per user. Pairs with the chat route bumping conversations.updated_at on each message insert.';
