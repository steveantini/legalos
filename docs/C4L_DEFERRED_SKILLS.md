# C4L deferred skills — tracking

Skills that were imported from the Claude for Legal repo but filtered out of the department-agent UI because they don't fit the chat-with-an-agent shape. These are deferred to future product surfaces, not abandoned.

This doc exists so the eventual Workflows session and any configuration-surface session can see what's queued for them.

## Filtered from `commercial-legal` (filtered 2026-05-21, migration 0024)

### review — belongs in Workflows

**Source:** `claude-for-legal:commercial-legal/review`
**Why filtered:** A router skill that reads the user's input, identifies whether it's an NDA / MSA / SOW / etc., and delegates to the appropriate specialist skill. Multi-step orchestration is the defining property of a Workflow in legalOS's taxonomy, not an Agent.
**Where it should land:** Workflows surface (planned Session 33). The "Review any commercial agreement" workflow would compose `review` (router) → leaf skills (`nda-review`, `saas-msa-review`, `vendor-agreement-review`).
**Action when Workflows is built:** un-soft-delete and convert to a workflow row, OR re-author as a workflow that calls the existing leaf agents.

### cold-start-interview — belongs in admin configuration

**Source:** `claude-for-legal:commercial-legal/cold-start-interview`
**Why filtered:** C4L's first-run playbook-learning skill. Designed to interview the user about their firm's positions on key clauses and produce a `CLAUDE.md` practice profile. One-shot setup, not a recurring agent interaction.
**Where it should land:** Admin configuration surface (no current home; would be a new surface). Possibly the same surface as "attach a firm playbook to a department" once that affordance exists.
**Action when configuration surface is built:** consider whether to expose this skill, or whether legalOS's playbook-attachment UX makes it redundant.

### customize — belongs in admin configuration

**Source:** `claude-for-legal:commercial-legal/customize`
**Why filtered:** Same shape as `cold-start-interview`. Configuration skill for tuning the agent's behavior to a firm's preferences.
**Where it should land:** Same as `cold-start-interview` — admin configuration surface.
**Action when configuration surface is built:** same as above.

## Pattern note

This filtering should be re-applied when any new C4L plugin is imported. The same three skill types (router, cold-start-interview, customize) appear across multiple C4L plugins — they're a C4L convention, not commercial-specific. Future plugin imports should pre-filter these by default, with the option to override per-plugin.

The sync pipeline (Shape B, future) should use this doc as input — skills listed here are intentionally not in the agent surface and should not be re-imported.
