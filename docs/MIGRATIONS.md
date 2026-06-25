# Database migrations

This repo is moving from **hand-applied** SQL migrations to the **tracked Supabase
CLI migration workflow** (linked repo + ledgered, replayable migrations). The move
is incremental and deliberately non-disruptive to the live production database,
which serves real traffic on the canonical domains.

## Where things stand

**Historical record (do not rewrite).** `supabase/migrations/0001_*.sql` through
`0076_*.sql` are the canonical historical record. They are plain SQL, sequentially
numbered (`NNNN_name.sql`), and were **applied to production BY HAND** via the
Supabase SQL editor / service-role path (the repo was never CLI-linked). A
read-only scoping pass found **no detectable schema drift**: running these files
against an empty database reproduces the current production schema (37 public
tables + 9 `operator_*` analytics views all match; spot-checked column-level).
These files stay exactly as they are. The hand-apply path remains the working
fallback until the tracked workflow is validated end to end.

> Seed DATA is a separate concern from SCHEMA. The built-in "Powered by legalOS"
> agents and the Claude for Legal library exist in production only because their
> seeding SCRIPTS were hand-run (they are not in committed seed SQL). That
> reproducibility gap is tracked under the org-onboarding roadmap item, not here.

**No CLI ledger in production yet.** The project (ref `knlnchvfjxchpbkuwtpp`) has
never been CLI-linked: there is no `supabase_migrations` ledger in prod, and
`supabase migration list` returns empty. We are adopting tracked migrations
**going forward via a one-time baseline** that records current prod as the
starting point. We are **NOT** rewriting history and **NOT** replaying the 76
files against prod (that would try to re-create existing objects and fail).

## What stage 1 did (this commit, no production contact)

- Added `supabase/config.toml` (minimal: `project_id` = the prod ref, which is not
  secret). No token, password, or other secret is committed.
- Left all 76 `supabase/migrations/*.sql` and all `supabase/seed/*` files
  untouched.
- Confirmed `.gitignore` covers CLI local artifacts (`supabase/.temp/`,
  `supabase/.branches/`) and env files.
- Ran **no** CLI commands and made **no** contact with the live project.

## NEXT STEPS (operator-run, CREDENTIALED — not done by an agent)

These require the operator's Supabase account access (a personal access token and
the database password) and must be run by a human. An agent must not hold these
credentials.

1. `supabase login` — authenticate the CLI (personal access token). **Human only.**
2. `supabase link --project-ref knlnchvfjxchpbkuwtpp` — link the repo to prod
   (prompts for the DB password). Link state is written under `supabase/.temp/`
   (gitignored). **Human only.**
3. **Baseline:** `supabase db pull` — generate a single baseline migration that
   captures current prod schema and seeds the `supabase_migrations` ledger as
   "applied from here." Review the generated baseline: its forward diff should be
   **empty** (no pending changes). A non-empty diff IS the drift inventory and
   must be reconciled before proceeding. **Recommended: dry-run on a Supabase
   branch / throwaway project first**, so setup never touches prod.

After the baseline shows a clean diff, the workflow going forward is:

- `supabase migration new <name>` -> edit the generated SQL -> `supabase db push`
  (recorded in the ledger). The first genuinely new tracked migration is intended
  to be the nullable `messages.pre_step_result jsonb` column (the Document
  Comparison redline reload-persistence follow-up, D-189) — an additive,
  nullable, no-default column on a hot-path table, which is a safe, low-risk
  change to validate the new workflow.

Until that first `db push` succeeds (ideally first on a branch), the hand-apply
path stays available, so there is no flag-day risk to production.
