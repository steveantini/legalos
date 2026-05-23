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

## Filtered from `corporate-legal` (filtered 2026-05-22, migration 0030)

### cold-start-interview — belongs in admin configuration

**Source:** `claude-for-legal:corporate-legal/cold-start-interview`
**Why filtered:** Same onboarding pattern as the other plugins. Modular interview that identifies which corporate practice areas apply (M&A, Board & Secretary, Public Company, Entity Management) and asks targeted questions per active module.
**Where it should land:** Admin configuration surface — unify with sibling cold-start-interview skills from other plugins.

### customize — belongs in admin configuration

**Source:** `claude-for-legal:corporate-legal/customize`
**Why filtered:** Same reconfiguration pattern as the other plugins.
**Where it should land:** Admin configuration surface — unify with sibling customize skills.

### matter-workspace — belongs in admin workspace management

**Source:** `claude-for-legal:corporate-legal/matter-workspace`
**Why filtered:** Same management pattern as the other plugins (already filtered in 0026).
**Where it should land:** Admin workspace management surface — unify with sibling matter-workspace skills.

### ai-tool-handoff — belongs in Workflows (skill-to-skill delegation flavor)

**Source:** `claude-for-legal:corporate-legal/ai-tool-handoff`
**Why filtered:** Not a user-facing chat-with-an-agent. Invoked BY another skill (`diligence-issue-extraction`) to delegate high-volume clause extraction to external bulk-review tools (Luminance, Kira, etc.) and QA their output. This is a *skill-to-skill delegation helper* — structurally a router, but different from commercial-legal's `review` (which was a top-level user-facing router). Both flavors of router belong in Workflows.
**Where it should land:** Workflows surface. A "diligence with bulk-review tool" workflow would compose `diligence-issue-extraction` → `ai-tool-handoff` → review the tool's output. The handoff is a workflow node that delegates to and QAs an external system.
**Action when Workflows is built:** consider whether this needs to be its own workflow node or a sub-step of a higher-level "deal diligence" workflow.

## Filtered from `employment-legal` (filtered 2026-05-22, migration 0032)

### cold-start-interview — belongs in admin configuration

**Source:** `claude-for-legal:employment-legal/cold-start-interview`
**Why filtered:** Same onboarding pattern as the other plugins. Learns the firm's jurisdictional footprint and escalation rules from handbook and termination memos.
**Where it should land:** Admin configuration surface — unify with sibling cold-start-interview skills.

### customize — belongs in admin configuration

**Source:** `claude-for-legal:employment-legal/customize`
**Why filtered:** Same reconfiguration pattern as the other plugins.
**Where it should land:** Admin configuration surface — unify with sibling customize skills.

### matter-workspace — belongs in admin workspace management

**Source:** `claude-for-legal:employment-legal/matter-workspace`
**Why filtered:** Same management pattern as the other plugins.
**Where it should land:** Admin workspace management surface — unify with sibling matter-workspace skills.

### internal-investigation — reference/framework skill (new pattern; defer to skill library)

**Source:** `claude-for-legal:employment-legal/internal-investigation`
**Why filtered:** Explicitly marked `user-invocable: false` in its frontmatter. Not a chat-with-an-agent — it's shared library code loaded BY other skills (`investigation-open`, `investigation-add`, `investigation-query`, `investigation-memo`, `investigation-summary`) as shared framework context. Different from a router: routers actively dispatch input at runtime; reference/framework skills are shared context loaded into other skills, never invoked themselves.
**Where it should land:** Skill library surface (no current home — likely a future component of the Workflows tier where workflow nodes can include shared framework modules).
**Action when skill library surface is built:** consider exposing this as a workflow building block; the five investigation-* agents would import it at composition time rather than at user-invocation time.

### international-expansion — reference/framework skill (new pattern; defer to skill library)

**Source:** `claude-for-legal:employment-legal/international-expansion`
**Why filtered:** Same pattern as `internal-investigation` — `user-invocable: false`, shared framework loaded BY `expansion-kickoff` and `expansion-update`.
**Where it should land:** Same as `internal-investigation` — skill library surface.
**Action when skill library surface is built:** same as above.

## Filtered from `regulatory-legal` (filtered 2026-05-22, migration 0035)

### cold-start-interview — belongs in admin configuration

**Source:** `claude-for-legal:regulatory-legal/cold-start-interview`
**Why filtered:** Same canonical onboarding pattern as the other plugins. Builds the regulator watchlist, indexes the policy library, and learns the firm's materiality threshold so the monitor surfaces signal instead of noise.
**Where it should land:** Admin configuration surface — unify with sibling cold-start-interview skills.

### customize — belongs in admin configuration

**Source:** `claude-for-legal:regulatory-legal/customize`
**Why filtered:** Same canonical reconfiguration pattern.
**Where it should land:** Admin configuration surface — unify with sibling customize skills.

### matter-workspace — belongs in admin workspace management

**Source:** `claude-for-legal:regulatory-legal/matter-workspace`
**Why filtered:** Same canonical management pattern as the other plugins.
**Where it should land:** Admin workspace management surface — unify with sibling matter-workspace skills.

### gap-surfacer — reference/framework skill (pattern #5; defer to skill library)

**Source:** `claude-for-legal:regulatory-legal/gap-surfacer`
**Why filtered:** Explicitly marked `user-invocable: false` in its frontmatter. Not a chat-with-an-agent — it's shared library code loaded BY `gaps` and `comments` skills as a common gap-and-comment tracker framework (state tracking, owner routing, Slack notifications). Same pattern as employment-legal's `internal-investigation` and `international-expansion`.
**Where it should land:** Skill library surface (same destination as other pattern #5 skills). When the skill library lands, gap-surfacer becomes the framework that `gaps` and `comments` import at composition time rather than at user-invocation time.

A side-channel observation: regulatory-legal is the first plugin we've audited where a reference/framework skill (`gap-surfacer`) is loaded by tracker-shape skills (`gaps`, `comments`). The trackers benefit from the shared framework for common operations like gap routing and notification. This is a useful pattern — see the clarifying note in the Tracker-shape skills section below.

## Filtered from `ai-governance-legal` (filtered 2026-05-23, migration 0038)

### cold-start-interview — belongs in admin configuration

**Source:** `claude-for-legal:ai-governance-legal/cold-start-interview`
**Why filtered:** Same canonical onboarding pattern as the other plugins. Learns the firm's AI governance practice and writes a profile from the AI policy, a reference impact assessment, and key vendor AI agreements.
**Where it should land:** Admin configuration surface — unify with sibling cold-start-interview skills.

### customize — belongs in admin configuration

**Source:** `claude-for-legal:ai-governance-legal/customize`
**Why filtered:** Same canonical reconfiguration pattern. Adjusts risk posture, escalation contacts, use-case registry entries, vendor AI positions, and policy commitments without re-running the cold-start interview.
**Where it should land:** Admin configuration surface — unify with sibling customize skills.

### matter-workspace — belongs in admin workspace management

**Source:** `claude-for-legal:ai-governance-legal/matter-workspace`
**Why filtered:** Same canonical management pattern as the other plugins.
**Where it should land:** Admin workspace management surface — unify with sibling matter-workspace skills.

Note: this plugin contains no reference/framework skills (pattern #5) — the first audited plugin where pattern #5 is absent. All non-configuration skills are user-invocable agents.

## Note on C4L `agents/` directories (across all plugins)

Each C4L plugin contains both a `skills/` directory and an `agents/` directory at its top level (e.g., `../claude-for-legal/<plugin>/skills/`, `../claude-for-legal/<plugin>/agents/`). The import script (`scripts/import-c4l-plugin.ts`) reads only from `skills/`.

The `agents/` directory carries C4L's scheduled-agent / managed-agent cookbook definitions — recurring autonomous agents like `renewal-watcher`, `deal-debrief`, `playbook-monitor`, `docket-watcher`, `reg-monitor`, `diligence-grid`, `launch-radar`. These are intentionally NOT imported via Option A (SKILL.md → agent row) because they require multi-step orchestration, scheduling, and external triggers that don't fit the chat-with-an-agent UX.

These belong in a future Option B integration path using C4L's Managed Agents API (`deploy-managed-agent.sh`). The architectural framing in the operator's earlier session work: cookbook agents are Option B candidates evaluated post-MVP.

The sync pipeline (Shape B, future) should NOT auto-import `agents/` content. If/when cookbook agents are wired in, they get their own ingestion path — likely a separate command or workflow surface, not the department-agent tier.

Plugins with `agents/` content observed (silently skipped by the import script):
- commercial-legal/agents/ (renewal-watcher, deal-debrief, playbook-monitor, …)
- privacy-legal/agents/
- product-legal/agents/
- corporate-legal/agents/
- employment-legal/agents/
- regulatory-legal/agents/

Plugins WITHOUT `agents/` directories:
- ai-governance-legal — first plugin audited without one. The `policy-monitor` skill's description mentions "on a recurring schedule" which would normally indicate a sibling scheduled-agent in `agents/`, but the directory isn't present. Possibly a forthcoming addition C4L hasn't shipped yet; possibly intentional (run on-demand only for v1).

The presence of an `agents/` directory is NOT universal across C4L plugins. The sync pipeline should not assume it.

## Note on C4L `data/` directories (observed in employment-legal)

The `employment-legal` plugin contains a `data/` directory at its top level (alongside `skills/`, `agents/`, `hooks/`, etc.). The import script (`scripts/import-c4l-plugin.ts`) reads only from `skills/` — `data/` content is silently skipped. The `data/` directory likely contains static reference data the plugin's skills load at runtime (jurisdictional rule tables, escalation policies, etc.). Out of scope for Option A (SKILL.md → agent row import); relevant for the future sync pipeline (Shape B) and any eventual workflow-or-skill-library surface that would need to make this data accessible.

Other plugins audited so far (commercial-legal, privacy-legal, product-legal, corporate-legal) did NOT have `data/` directories. employment-legal is the first.

Sync pipeline note: when Shape B is built, the import logic should explicitly skip `data/` (and `hooks/` and other non-skill directories) rather than relying on the current "only read from skills/" implementation detail.

## Pattern note (revised after employment-legal import)

This filtering should be re-applied when any new C4L plugin is imported. The following skills are C4L conventions that appear across multiple plugins and should be filtered from the department-agent tier by default:

1. **Router skills** — two flavors, both belong in Workflows:
   - **User-facing routers** (e.g., `review` in commercial-legal) — the user types a request, the router identifies the type and delegates to a specialist skill.
   - **Skill-to-skill delegation helpers** (e.g., `ai-tool-handoff` in corporate-legal) — invoked BY another skill to delegate sub-tasks to external tools, then QA the result.

   Both produce multi-step orchestration; both belong in the Workflows surface as composable workflow nodes.
2. **Onboarding skills** (`cold-start-interview`) — first-run playbook learning; belongs in admin configuration surface.
3. **Reconfiguration skills** (`customize`) — adjust an existing profile without re-running onboarding; belongs in admin configuration surface.
4. **Matter management skills** (`matter-workspace`) — create/list/switch/close matter workspaces; not a chat-with-an-agent shape. Belongs in admin/workspace management surface.
5. **Reference/framework skills** — explicitly marked `user-invocable: false` in their frontmatter, loaded BY other skills as shared context, never invoked directly. Different from routers (routers actively dispatch input; reference/framework skills are shared library code). Examples: `internal-investigation` and `international-expansion` in employment-legal. They belong neither in the agent tier nor in Workflows as standalone nodes. Closest match is a future "skill library" surface — until that exists, defer.

Future plugin imports should pre-filter these five types by default, with the option to override per-plugin if a specific skill diverges from the convention.

The sync pipeline (Shape B, future) should use this doc as input — skills listed here are intentionally not in the agent surface and should not be re-imported.

## Tracker-shape skills (imported as agents for v1; candidates for future tracker UI)

Some C4L skills present as agents (chat-with-an-agent UX) but functionally operate on a YAML state file with multi-mode commands. They work conversationally for v1, but long-term they're candidates for dedicated tracker UI surfaces — think Linear-style task boards or compliance dashboards.

Tracker-shape skills come in two structural forms across the C4L plugins audited so far. Both forms benefit from dedicated tracker UI long-term.

**Structural form 1 — single multi-mode skill** (corporate-legal pattern). One skill operates a YAML state file via multi-mode commands (init, update, report, etc.).

A form 1 tracker may load a separate reference/framework skill (pattern #5) for shared infrastructure across multiple trackers — e.g., regulatory-legal's `gaps` and `comments` trackers both load the `gap-surfacer` framework for common state tracking, owner routing, and notification logic. The trackers stay form 1 (single multi-mode skill each); the shared framework is a separate concern handled via pattern #5.

- `claude-for-legal:corporate-legal/closing-checklist` — closing checklist tracker (modes: init, update, status)
- `claude-for-legal:corporate-legal/entity-compliance` — entity compliance deadlines tracker (modes: init, report, update, sweep, audit, export)
- `claude-for-legal:corporate-legal/integration-management` — post-closing M&A integration tracker (modes: init, contracts, report, update, export)
- `claude-for-legal:regulatory-legal/gaps` — open regulatory-policy gaps tracker (modes: read, close, risk-accept); loads gap-surfacer framework
- `claude-for-legal:regulatory-legal/comments` — NPRM comment-period tracker (modes: read, decide); loads gap-surfacer framework
- `claude-for-legal:ai-governance-legal/ai-inventory` — EU AI Act per-system inventory tracker (modes: list, add, edit, classify, show); see leading-edge note below

**Structural form 2 — tracker pairs** (employment-legal pattern). Two skills work together on a shared YAML state file — typically one for read/check, one for write/update:

- Leave pair, operating on `leave-register.yaml`:
  - `claude-for-legal:employment-legal/leave-tracker` — read-side: check open leaves for deadline alerts and required decisions
  - `claude-for-legal:employment-legal/log-leave` — write-side: add a new leave to the register
- Expansion pair, operating on per-country expansion trackers:
  - `claude-for-legal:employment-legal/expansion-kickoff` — init: open international expansion planning for a new country
  - `claude-for-legal:employment-legal/expansion-update` — update: recalculate what's unblocked, flag overdue items

**Why kept as agents for v1:** The user-facing surface IS conversational — "what's left to close?" or "what's due this month?" The internal YAML-state-machine implementation doesn't change the user experience.

**Why flagged for future migration:** Trackers benefit enormously from dedicated UI — visible state, at-a-glance status, click-to-update affordances, calendar integration. When legalOS builds tracker UIs (likely in a future surface alongside Workflows), these skills become natural candidates for migration. The migration would not retire the skill; it would expose its data via a UI rendering instead of (or alongside) the chat interface.

**Action when tracker UI surface is built:** evaluate which of these skills migrate to native UIs, which stay as agents, and which run in both modes. The decision per skill will depend on how much value the dedicated UI adds over the conversational interface.

**Leading-edge tracker-UI candidate: `ai-inventory`.** Of all tracker-shape skills audited, the AI Governance EU AI Act inventory is the strongest candidate for "agent → dedicated UI" migration when the tracker-UI surface is built. Its substantive content — per-system role (provider, deployer, importer, distributor, authorized representative, product manufacturer) and per-system risk tier (prohibited, high-risk, limited, minimal, GPAI, GPAI+systemic) — is inherently tabular structured data that maps naturally to form fields, dropdowns, and table views. The SKILL.md body is 10.7KB (substantially larger than any other tracker we've audited), reflecting the depth of the embedded EU AI Act methodology that the tracker would need to surface. When the tracker UI lands, this is the most obvious first migration.
