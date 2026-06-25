# Database migrations

This repo uses the **tracked Supabase CLI migration workflow**: the repo is
linked to the production project, the migration ledger is baselined, and new
migrations are authored as timestamped files and applied with `supabase db push`.
The earlier **hand-applied** path (SQL pasted into the Supabase SQL editor via the
service-role) is retired for new schema changes, though the 76 historical files it
produced are kept verbatim as the canonical baseline.

## Where things stand

**Live and baselined (2026-06-25).** The project (ref `knlnchvfjxchpbkuwtpp`) is
CLI-linked, the `supabase_migrations` ledger exists in production, and
`supabase migration list` shows Local == Remote. The inaugural tracked migration
(`20260625163357_add_pre_step_result_to_messages`) was authored in-repo and applied
with `supabase db push`. The workflow is validated end to end.

**Historical record (do not rewrite).** `supabase/migrations/0001_*.sql` through
`0076_*.sql` are the canonical historical record. They are plain SQL, sequentially
numbered (`NNNN_name.sql`), and were **applied to production BY HAND** via the
Supabase SQL editor / service-role path (the repo was not yet CLI-linked when they
landed). A read-only scoping pass found **no detectable schema drift**: running
these files against an empty database reproduces the current production schema (37
public tables + 9 `operator_*` analytics views all match; spot-checked
column-level). These files stay exactly as they are. New migrations follow the
CLI's timestamped naming (below), so the ledger and file order agree from here on.

> Seed DATA is a separate concern from SCHEMA. The built-in "Powered by legalOS"
> agents and the Claude for Legal library exist in production only because their
> seeding SCRIPTS were hand-run (they are not in committed seed SQL). That
> reproducibility gap is tracked under the org-onboarding roadmap item, not here.

## How the baseline was established

The ledger was **NOT** created via `supabase db pull`. Because the 76 sequential
files already are the authoritative history, pulling a fresh single-file baseline
would have discarded that granularity. Instead the existing files were registered
into the remote ledger as already-applied:

```sh
supabase migration repair --status applied 0001 0002 … 0076
```

This marks `0001`..`0076` as applied in the remote `supabase_migrations` ledger
without re-running them against production (which would try to re-create existing
objects and fail). The 76 files are retained on disk as history; only the ledger
rows were added. After the repair, `supabase migration list` shows every historical
file as applied on both Local and Remote.

## Going-forward workflow

For every new schema change:

1. `supabase migration new <name>` — a LOCAL-ONLY command that writes an empty
   timestamped file (`supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`) and makes no
   DB contact.
2. Edit the generated file with the migration SQL. Keep changes additive and
   safe-under-live-traffic where possible (the project runs real production
   traffic; there is no separate staging DB today).
3. `supabase db push` — applies the pending migration(s) to production and records
   them in the ledger. Success = the new migration appears in the Remote column of
   `supabase migration list`.

**Authoring vs. application.** Claude Code AUTHORS migration files (and the
defensive code that tolerates the column/table being absent until the migration
lands); the OPERATOR runs `supabase db push` from their own machine. The agent
holds no Supabase credentials and the Supabase MCP is read-only. CI-applied
migrations (a deploy gate that runs `db push` automatically) remain a future
option, but CC-authors / operator-pushes is the current path.

## CLI authentication on this operator's machine

`supabase login` opens a browser flow and then tries to store the access token in
the macOS keychain. On this operator's machine that keychain write fails (the login
keychain password has drifted from the account password, so the keychain prompt
cannot be satisfied). The working alternative is to authenticate via environment
variables for the shell session instead of the keychain:

```sh
export SUPABASE_ACCESS_TOKEN=…   # personal access token, scoped to the CLI
export SUPABASE_DB_PASSWORD=…    # the project database password
```

With both exported, `supabase link`, `supabase migration repair`, and
`supabase db push` run without any keychain interaction. The exports live only in
the session shell; nothing is written to the repo (`.gitignore` covers
`supabase/.temp/` and env files), and no secret is committed (`config.toml` carries
only the non-secret `project_id`).

### Security follow-ups from setup

- **Rotate the CLI-local access token.** The `SUPABASE_ACCESS_TOKEN` used for setup
  was created for this work; rotate (revoke + reissue) it in the Supabase dashboard
  once the workflow is settled, and keep CLI tokens narrowly scoped.
- **The database password was reset during setup.** The project DB password was
  reset to obtain a known `SUPABASE_DB_PASSWORD` for linking. Treat the current
  value as the canonical one; if it is rotated again, re-export it for future CLI
  sessions.
