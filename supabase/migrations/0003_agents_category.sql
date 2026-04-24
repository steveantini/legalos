-- ============================================================================
-- 0003_agents_category.sql
-- ============================================================================
-- Adds a `category` text column to public.agents. The launchpad UI groups
-- agent cards into labeled sections by category; slug → display-label
-- translation happens in the UI layer (see
-- components/launchpad/category-labels.ts), so this column stores raw
-- slugs like 'sell-side', 'buy-side', etc.
--
-- No RLS change: existing SELECT policies project all columns; the new
-- column joins their result sets automatically. Index is added for the
-- case where a later query filters on category.
-- ============================================================================

alter table public.agents add column if not exists category text;
create index if not exists agents_category_idx on public.agents (category);
