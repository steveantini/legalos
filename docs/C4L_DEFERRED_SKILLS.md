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

## Filtered from `commercial-legal` — additional (filtered 2026-05-22, migration 0026)

### matter-workspace — belongs in admin workspace management

**Source:** `claude-for-legal:commercial-legal/matter-workspace`
**Why filtered (retroactively):** The original commercial-legal import (commit 27da5e2) included `matter-workspace` because it wasn't recognized as a configuration-pattern skill at that time. Re-evaluation during the privacy-legal import surfaced that `matter-workspace` is a management tool (create/list/switch/close client matters) rather than a chat-with-an-agent. Soft-deleted retroactively so the pattern is consistent across all C4L imports going forward.
**Where it should land:** Admin workspace management surface (no current home; would be a new surface, likely co-located with cold-start-interview and customize as the "admin configuration" cluster).
**Action when admin configuration surface is built:** consider whether to expose this skill as-is, or whether legalOS's eventual matter-management UX makes it redundant.

## Filtered from `privacy-legal` (filtered 2026-05-22, migration 0026)

### cold-start-interview — belongs in admin configuration

**Source:** `claude-for-legal:privacy-legal/cold-start-interview`
**Why filtered:** Same shape as the commercial-legal version. Onboarding skill, one-shot setup, not a chat-with-an-agent.
**Where it should land:** Admin configuration surface.
**Action when configuration surface is built:** consider whether to expose this skill alongside the commercial-legal version, or unify them into a single cross-plugin onboarding flow.

### customize — belongs in admin configuration

**Source:** `claude-for-legal:privacy-legal/customize`
**Why filtered:** Same shape as the commercial-legal version. Reconfiguration skill.
**Where it should land:** Admin configuration surface.
**Action when configuration surface is built:** same as commercial-legal.

### matter-workspace — belongs in admin workspace management

**Source:** `claude-for-legal:privacy-legal/matter-workspace`
**Why filtered:** Same shape as commercial-legal's matter-workspace. Management tool for client matters, not a chat-with-an-agent.
**Where it should land:** Same as commercial-legal's matter-workspace — admin workspace management surface.
**Action when admin configuration surface is built:** unify with commercial-legal version into a single matter-workspace management UI.

## Filtered from `product-legal` (filtered 2026-05-22, migration 0027)

### cold-start-interview — belongs in admin configuration

**Source:** `claude-for-legal:product-legal/cold-start-interview`
**Why filtered:** Same onboarding pattern as commercial-legal and privacy-legal. Connects to the launch tracker, reads past reviews, learns risk calibration. One-shot setup.
**Where it should land:** Admin configuration surface — unify with sibling cold-start-interview skills from other plugins.

### customize — belongs in admin configuration

**Source:** `claude-for-legal:product-legal/customize`
**Why filtered:** Same reconfiguration pattern as commercial-legal and privacy-legal. Adjusts an existing profile without re-running onboarding.
**Where it should land:** Admin configuration surface — unify with sibling customize skills.

### matter-workspace — belongs in admin workspace management

**Source:** `claude-for-legal:product-legal/matter-workspace`
**Why filtered:** Same management pattern as commercial-legal and privacy-legal matter-workspace skills (already filtered in 0026). Create/list/switch/close client matters — not a chat-with-an-agent shape.
**Where it should land:** Admin management surface — unify with sibling matter-workspace skills.

## Note on C4L `agents/` directories (across all plugins)

Each C4L plugin contains both a `skills/` directory and an `agents/` directory at its top level (e.g., `../claude-for-legal/<plugin>/skills/`, `../claude-for-legal/<plugin>/agents/`). The import script (`scripts/import-c4l-plugin.ts`) reads only from `skills/`.

The `agents/` directory carries C4L's scheduled-agent / managed-agent cookbook definitions — recurring autonomous agents like `renewal-watcher`, `deal-debrief`, `playbook-monitor`, `docket-watcher`, `reg-monitor`, `diligence-grid`, `launch-radar`. These are intentionally NOT imported via Option A (SKILL.md → agent row) because they require multi-step orchestration, scheduling, and external triggers that don't fit the chat-with-an-agent UX.

These belong in a future Option B integration path using C4L's Managed Agents API (`deploy-managed-agent.sh`). The architectural framing in the operator's earlier session work: cookbook agents are Option B candidates evaluated post-MVP.

The sync pipeline (Shape B, future) should NOT auto-import `agents/` content. If/when cookbook agents are wired in, they get their own ingestion path — likely a separate command or workflow surface, not the department-agent tier.

Plugins with `agents/` content observed (silently skipped by the import script):
- commercial-legal/agents/ (renewal-watcher, deal-debrief, playbook-monitor, …)
- privacy-legal/agents/ (verify count when needed)
- product-legal/agents/ (verify count when needed)
- Future plugins likely similar.

## Pattern note (revised after privacy-legal import)

This filtering should be re-applied when any new C4L plugin is imported. The following skills are C4L conventions that appear across multiple plugins and should be filtered from the department-agent tier by default:

1. **Router skills** (e.g., `review` in commercial-legal) — multi-step orchestration; belongs in Workflows.
2. **Onboarding skills** (`cold-start-interview`) — first-run playbook learning; belongs in admin configuration surface.
3. **Reconfiguration skills** (`customize`) — adjust an existing profile without re-running onboarding; belongs in admin configuration surface.
4. **Matter management skills** (`matter-workspace`) — create/list/switch/close matter workspaces; not a chat-with-an-agent shape. Belongs in admin/workspace management surface.

Future plugin imports should pre-filter these four types by default, with the option to override per-plugin if a specific skill diverges from the convention.

The sync pipeline (Shape B, future) should use this doc as input — skills listed here are intentionally not in the agent surface and should not be re-imported.
