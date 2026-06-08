# legalOS — Chat Session Handoff

This file is the bootstrap document a fresh chat session reads to come up to speed on legalOS. Read it in full before doing any work.

## What legalOS is

legalOS is an AI-native operating system for legal teams. Next.js 16 (App Router) + Supabase (Postgres with RLS) + Anthropic API. Production-shape architecture, pre-launch product.

Repo: `/Users/stevenantini/Projects/legalos`. Sibling repos used as reference material:
- `/Users/stevenantini/Projects/claude-for-legal` (Anthropic's open-source Claude for Legal — the source of C4L agents imported into legalOS)
- `/Users/stevenantini/Projects/project-kindred` (an earlier reference codebase)

## Current state (admin arc close-out — read this first)

This section is the current honest state as of the admin arc close-out (A7), PLUS one arc completed after it: the **Workflows arc is COMPLETE (2026-06-06, D-115 through D-124)** — headless agent runtime, declarative workflow engine with durable approval pause/resume, no-code agent-centric builder, run/audit/approve surfaces, and the Template Library with forkable starter templates; see docs/ROADMAP.md (the Workflows section) for the full record and the deliberately-deferred items (branching, portable recipes, triggers, full autonomy). The historical record (polish phase, prior arcs, key files) follows below and remains accurate; read this first so the current state is not reconstructed from the history.

### Where the product is

The admin section's GOVERN side is COMPLETE: Policy & access (capability ceiling, allowed connection categories, org default model, super-admin governance), People (roster, role editor, soft-deactivation, invitation), and the Audit log (a read-only People-activity feed). All sensitive mutations use three-layer enforcement (honest UI, server-action re-check, a DB trigger/RLS as the authoritative guard), mirror-RLS (D-041), and honest-state throughout. The connector hub and Connections settings page were completed earlier (Drive picker with folder browse, the loading-choreography standard, the two-column-then-grid Connections layout, the 896px settings/admin width standard).

### Model state

Claude Opus 4.8 (anthropic/claude-opus-4-8) is the flagship and the system/org default, on a single canonical models source (lib/llm/models.ts) that all pricing/validation/display/pickers derive from, the future plug-in point for models-as-a-connection. The full agent-form picker lists 5 models (Opus 4.8/4.7/4.6, Sonnet 4.6, Haiku 4.5); the composer quick-pick is 3 (Opus 4.8, Sonnet 4.6, Haiku 4.5). Existing agents were swept to Opus 4.8 by a one-time operator SQL update. Models can be ADDED but NOT retired until model-retirement handling is built (see deferred).

### What's deferred and why (nothing here is unfinished by accident)

- Insights cost + ROI lens (A4b): gated on the business-model decision, recorded cost (cost_micro_usd in usage_events) is the customer's cost under bring-your-own-model but legalOS's margin under managed pricing, so an honest cost/ROI view needs the pricing model decided first; also needs the Productivity Calculator's ROI assumptions moved from localStorage to org storage.
- Insights usage lens (A4a): shipped as a functional placeholder (demoable via a sample-data toggle), pending a deliberate delight pass.
- Evals (A5): the deepest open design question ("what is an eval for a non-engineer?"); deferred for a real design conversation.
- Connections phase (next major arc): models-as-a-connection (Anthropic first; available models derive from connected providers); discovery automation via the provider Models API; notify-and-approve lifecycle (new models / C4L capabilities never auto-enable, the super admin is notified and activates on approval, LOCKED); C4L reframed as a connection; the API-vs-CLI-vs-MCP connection-mechanism question; model-retirement handling (graceful fallback and/or flag-and-choose; operator leans option 2/3; prerequisite before curating the model list down). **Framing (from the opening investigation):** the phase is not "extend the connector registry" but "generalize the connection abstraction beyond OAuth data sources." The current connector assumes one shape, a user OAuth-connects an external account whose data agents read/write (the ProviderAdapter contract, the AES secret model, and the category + read/write-ceiling governance are all OAuth-data-source-shaped). The next things to connect are different kinds, so the FOUNDATIONAL decision that gates the rest is how to generalize the connection abstraction to support non-OAuth connection types (key-based model providers, MCP servers, governed-content sources); that is the first design conversation of the phase. Findings: the models.ts seam is clean and single-sourced (8 consumers, swapping the source is the easy ~20%) but the surrounding ~80% is real work (Anthropic is an always-on platform env key not a connection, so BYO needs a connect path + per-org key resolution in the chat route; the abstraction is OAuth-only and does not fit key-based providers; pricing/cost has NO discovery source, a discovered model has no price, pricing must be entered/configured; a net-new per-model notify-and-approve governance dimension is needed that the read/write ceiling does not model). MCP: zero in the codebase, a significant reframe if pursued (new adapter contract, connect flow, secret shape, exercise path). C4L: today just a source_origin provenance string from the manual import script, no entity/connection/upstream/governance, so reframing it as a connection is essentially net-new. Discovery automation: net-new infra (no cron, scheduled functions, webhooks, background jobs, or notification system exist; Vercel cron / Supabase scheduled functions are available but unconfigured). Secret model: connection_secrets (AES-256-GCM, service-role-only) is reusable for a BYO key with no schema change (a sibling encryptApiKey is trivial), but the OAuth connect flow, TokenBundle typing, and refresh semantics do not carry over. Governance: notify-and-approve (LOCKED) maps onto a new "approved models" set the connection-derived list is filtered through, governed in Policy & access (extends cleanly as a surface, but has no pending/approved-model concept and no notification primitive today, both net-new). Suggested opening for the next session: the connection-abstraction design conversation, since models-as-a-connection, MCP, and C4L all depend on it; then models-as-a-connection (Anthropic first) as the first concrete build, which leads into the Business model & pricing arc, which unblocks A4b. **Decided architecture (flags 1 & 2, settled in design discussion; see ROADMAP "Connections phase — decided architecture" for the full version):** (1) Models-as-a-connection is a NON-OAuth connection kind inside a GENERALIZED connection abstraction, with two ORTHOGONAL axes kept independent, which provider (an interchangeable adapter: Anthropic first, then Google/OpenAI/self-hosted) and whose credentials (a credential source: "managed" = legalOS platform key the customer never sees, "BYO" = customer key in the existing connection_secrets AES substrate). Mechanism is KEY-BASED (not OAuth, not MCP). The chat route resolves the credential at CALL TIME by org mode, replacing the always-on ANTHROPIC_API_KEY read; orthogonality means every combination works with no special-casing. A configurable endpoint/base-URL is baked in from the start so self-hosted (BYO-only, OpenAI-compatible endpoint the customer runs) slots in with no retrofit. Anthropic available now; Google/OpenAI/self-hosted coming soon in that order. UX = the "best agnostic model connector" (two-axes-legible, provider-uniform; build against the frontend-design skill). Proof-out: BYO-Anthropic on the operator's own instance to exercise call-time credential resolution. (2) MCP is a FIRST-CLASS connection kind built in from the start, PREFERRED for trusted tool/data sources (maintenance/standardization win, not speed) with bespoke adapters as fallback, under a STRICT TRUST BOUNDARY: "trusted" = ONLY first-party official servers on a legalOS-curated vetted allowlist OR customer-self-hosted endpoints; ARBITRARY THIRD-PARTY / COMMUNITY MCP SERVERS NEVER CONNECT (no code path), because MCP's security maturity lags its adoption (CVEs, path-traversal, tool-poisoning) and that is unacceptable for privileged legal data. All MCP connections are governed by notify-and-approve (super admin opts in per org). Pairs with self-hosted models for maximal data sovereignty (own model + own MCP servers, nothing leaves the firm's walls). Both the MCP trust posture and the data-sovereignty story are durable trust/marketing assets (captured in the ROADMAP security-transparency lens). **Discovery automation (flag 4, decided; build deferred onto its dependencies):** generalized notify-and-approve shape (detect upstream change -> the OWNING authority reviews -> explicit apply -> audited, NEVER auto-apply), refined to a MANUAL-TRIGGER model near-term: the platform owner presses a "check for updates" button that runs detection queries ON DEMAND (provider Models API; C4L GitHub repo) and offers the choice to act, deliberately AVOIDING net-new scheduled-task infra (no cron/webhooks/background jobs in v1; scheduling is a later "if you tire of the button" enhancement). Two-stage authority-matches-ownership: the PLATFORM OWNER governs what's OFFERED (add a released model to the platform catalog; ship a C4L version) via the button; the CUSTOMER super admin governs what's ENABLED per org (tenant-side notify-and-approve in Policy & access). Core deliverable = the DETECTION LOGIC (the "what's new" queries); a general NOTIFICATION PRIMITIVE (nothing notifies today; the audit tables only record) is the prerequisite for any future push/scheduled flow, built when first needed and designed generally. Detection-value asymmetry: manual suffices indefinitely for owner-authored C4L (the owner already knows it changed); MODEL releases (provider-authored) are the candidate for eventual scheduling. Build staging: model discovery builds with/after models-as-a-connection; C4L discovery builds with the platform-owner tier (the owner's button + catalog live there). **This completes the Connections-phase flag decisions (flags 1-4 all decided).**
- Business model & pricing (major arc after Connections, gates A4b): managed vs bring-your-own-model vs both; four pricing layers (platform/model/usage/services); don't hard-bake margins (inference ~10x/yr cheaper); reasoning-model use offsets token savings.
- C4L decided model (flag 3, supersedes "C4L reframed as a connection" above): C4L is a vendor-owned CONTENT LIBRARY, NOT a connection ("connection" is reserved for things the customer connects outward to; C4L flows inward from the vendor). Default-ON value-add with a customer super-admin OFF switch (binary library on/off, NOT version-by-version); not live-synced (deliberate update events). Governance authority = legalOS (authority matches OWNERSHIP: the customer owns their data/models/tools and governs those; legalOS owns C4L content and decides what ships, avoiding customer version fragmentation); notify-and-approve still applies but the approver is the legalOS owner, not the customer. Build staged: near-term it stays an operator-managed content set (cleaned up from the manual import script, default-on with the off-switch); the full owner-approval + cross-org propagation lands in the platform-owner tier (below). C4L-content QUALITY monitoring is a PLATFORM-level concern (legalOS's content/quality bar), distinct from tenant Evals (customers evaluate their OWN agents); do not merge. **Placement (decided):** the super-admin C4L on/off control lives in ADMIN -> Policy & access (an org-wide super-admin governance toggle, like the default model and connection policy, NOT a personal Settings item and NOT in Connections since C4L is content not a connection), as its own new "Content" section AFTER Default model (page order: Allowed connections -> Default model -> Content). The Content section is built as a LIST OF CONTENT PROVIDERS (filled-row register: name + description + on/off per row), not a single hardcoded toggle, since more content providers are likely (a new one = a new row, mirroring allowed_categories); super-admin-interactive, read-only for other admins. Users need NO setting (presence = visibility: they see the enabled library's agents in their department lists). Storage is a build-time note: an org-scoped store designed for MULTIPLE providers from the start (a content_provider_settings table keyed by org+provider, or org JSONB, like default_model). A dedicated top-level "Content" admin area is deferred until justified; for now it's a section within Policy & access.
- Platform-owner administration tier (major arc, after Connections + business model): a SEPARATE admin tier ABOVE customer super_admins with CROSS-TENANT scope, for legalOS-the-vendor (everything built so far is TENANT administration: a customer governing their own org). Three pillars: (1) customer/tenant management (all orgs/users 60,000-foot view, tenant lifecycle, support tooling incl. heavily-audited impersonation); (2) commercial (billing & subscriptions implementing and metering the business-model pricing decision, accounts, plan/entitlement management); (3) platform operations (cross-customer product analytics for customer success/adoption, the platform cousin of tenant Insights on the same usage_events scoped cross-tenant; C4L content management = the owner ship-this-version approval + cross-org propagation; platform-wide model/connector CATALOG governance = which providers/models exist as OPTIONS vs a customer ENABLING one; platform health; cross-tenant security/audit). Net-new: platform-STAFF identity (accounts not tied to one org); DELIBERATE cross-org access that INVERTS the org-scoped-RLS-everywhere safety the whole product is built on (the one place allowed to cross org boundaries, so the most heavily gated + audited capability, and a key trust-story claim: legalOS-staff access is restricted/audited/scoped); a separate platform surface/console. Design for tenant/platform SYMMETRY (Insights, governance, audit each have a tenant + a platform version; share the underlying data/queries scoped differently rather than building twice). Evals stays tenant-level; C4L-content quality is its platform cousin. Coupling: tied to the business-model arc (billing implements pricing). Chain: Connections (models-as-a-connection) → business model → platform tier → also unblocks A4b.
- Audit coverage expansion: event-log the unaudited governance actions (Policy & access edits, connection grant/revoke, invitation lifecycle, agent/department changes).
- Security/governance transparency: a standing lens, make each governance decision articulable for trust/security docs; the DECISION_LOG is the raw material.

### Parked operational item

Invitation (A3c) works in code but cannot SEND real invites until a verified sending domain is set up in Resend and the Supabase custom-SMTP sender is changed from onboarding@resend.dev to an address on that domain. No legalOS domain exists yet; testing is deferred. For a demo, drive it on the operator's own account, or get a domain. This is a Supabase/Resend config step, not an app bug. (A future session should treat this as parked; do not grant the over-permissioned Supabase MCP authorization a prior session requested.)

### Testing caveat

Several People features (role editor, deactivation) cannot be fully exercised solo because the org has a single super admin and the last-active-super-admin protections correctly block self-actions. Full testing arrives once a second user exists (which needs the invite-email domain, or a manually-provisioned second account).

### How the work runs (process)

Three-actor pattern: Claude Chat writes patch prompts; the operator pastes them to Claude Code (CC); the operator pastes CC's reports back. CC works autonomously (autonomy mode set) and applies the end-of-task commit + push without asking. Migrations are applied BY HAND by the operator in the Supabase SQL Editor (the repo is unlinked; CC never runs db push), and security-critical migrations are applied BEFORE the dependent feature is used. Credentials/secrets are never pasted in chat, the operator enters them directly into Vercel/Supabase/.env. Docs are amortized into each feature commit. Prod auto-deploys from origin/main to the canonical Vercel domain; the operator reviews in prod.

## The three actors

Work happens across three actors:

1. **Operator (Steven Antini)** — the human running the project. Makes product decisions, runs Claude Code commands and database migrations, pastes outputs back.
2. **Claude Chat (you)** — strategic and design partner. Asks one question at a time. Writes precise patch prompts for Claude Code. Discusses product/design decisions. Maintains and updates the polish list. Does NOT execute code.
3. **Claude Code** — terminal agent that executes patch prompts written by Claude Chat. Edits files, runs builds, commits, and pushes. Reports back to the operator who pastes the report into Claude Chat.

The three-actor handoff: Claude Chat writes a patch prompt in a quadruple-backtick fence; operator pastes it into Claude Code; Claude Code executes and reports; operator pastes the report back into Claude Chat.

## Working rules — these are locked

These are the discipline conventions established across the arc. The fresh chat must honor them from message one.

### The dual-delight standard — non-negotiable, applies to every recommendation

Every design decision, code change, copy choice, architectural pattern, or product recommendation must be evaluated against this question:

> *What would a top-line designer, developer, and product manager do if (1) they worked for a cutting-edge AI-native product on par with Apple, Linear, Vercel, Stripe, and Notion, and (2) they were optimizing for the most delightful experience from BOTH the end user's perspective AND the maintainer of the software's perspective?*

This standard is the default lens, not a special-occasion lens. It applies whether the work is large (a new feature) or small (a doc comment, a one-line copy change, a sort_order decision). The operator should never have to remind anyone to apply it.

Concretely, this means:

- **For users:** the experience should feel as thoughtful as Apple's most polished surfaces, as fast and clean as Linear's interaction model, as honest and quiet as Stripe's design voice, as discoverable as Notion's information architecture.
- **For maintainers:** the code should read like the next engineer is a smart stranger who will inherit it without context — clear naming, durable abstractions, minimal cleverness, no implicit conventions, no fake symmetries.
- **For both:** decisions should be reversible where possible, defaults should be safe, and the "why" of a decision should be discoverable through code comments, doc updates, or commit messages.

When a recommendation is made, the reasoning silently honors this standard. When the operator asks "what's the right call?", the answer is the one a top-line team would make — not the easy one, not the cheap one, not the shortcut.

Shortcuts are forbidden. Build for the long term, every time.

When proposing options, prefer the option this standard would choose, and explain the reasoning. When the operator pushes back, treat the pushback as information about something the standard missed, not as permission to lower the standard.

**Dialogue rules:**
- One question at a time. Never bundle multiple sub-decisions into one prompt.
- Senior dev-designer voice. Apple / Linear / Vercel / Stripe ethos.
- Hyper focus on delightful UX for BOTH end users AND maintainers (the dual-delight standard).
- Don't surface seven sub-decisions when one suffices.
- Don't bundle multiple step prompts. One patch prompt per turn.
- Build for the long term. No shortcuts. Correct seed drift retroactively when found.
- Always document and categorize new patterns in the deferred-skills doc — the operator does not retain all of them.

**Patch prompt format:**
- One paste per prompt with quadruple-backtick outer fences.
- Inside the fence, list files touched, full content of new files, exact edits to existing files, explicit "DO NOT" instructions for things Claude Code should not do (run scripts, apply migrations).
- End every patch prompt with the commit message and `git push origin main`. Auto-commit and push convention is in effect.

**Operator preferences:**
- Sentence case for buttons.
- Curly apostrophes in user-facing copy; straight apostrophes in code/internal docs.
- `text-primary` for brand slate-blue.
- Cutting-edge AI-native product discipline.

**Code conventions:**
- TypeScript throughout.
- Server Components by default; Server Actions for mutations.
- Cache-wrapped helpers in `lib/auth/access.ts` (the project's primary access layer).
- shadcn/ui components, Tailwind, no per-department color treatments.
- Sort_order on departments: Operations and General Tools always last in that order. New substantive practice-area departments slot in before Operations; Operations and General Tools shift their sort_order accordingly.

## What's been built

### Three-tier agent architecture

Every agent in the system is one of three tiers:

1. **Canonical (Department) agents** — `is_template=true`, `created_by=null`, `source_origin=null`. Authored by legalOS. Forkable by users.
2. **Personal (My) agents** — `is_template=false`, `created_by=<uid>`, `source_origin=null`. User's own agents, freely editable by their owner.
3. **Claude for Legal (C4L) agents** — `is_template=true`, `created_by=null`, `source_origin='claude-for-legal:<plugin>/<skill>'`. Imported from Anthropic's open-source Claude for Legal. Hybrid edit model: read-only for name/description/system_prompt/web_search; editable for model/references/export_format; admin-only access to the edit form.

The three tiers render as three sections on the department launchpad: Department Agents (Canonical), Claude for Legal (C4L), My Agents (Personal).

### 13 departments organized into a four-group taxonomy

| Position | Slug | Name | Cluster |
|---|---|---|---|
| 1 | commercial | Commercial | Deal & transactional |
| 2 | corporate | Corporate | Deal & transactional |
| 3 | regulatory | Regulatory | Regulatory & compliance |
| 4 | public-sector | Public Sector | Regulatory & compliance |
| 5 | compliance | Compliance | Regulatory & compliance |
| 6 | privacy | Privacy | Regulatory & compliance |
| 7 | ai-governance | AI Governance | Regulatory & compliance |
| 8 | product | Product | Specialized practice |
| 9 | employment | Employment | Specialized practice |
| 10 | ip | IP | Specialized practice |
| 11 | litigation | Litigation | Specialized practice |
| 12 | operations | Operations | Operational & utility |
| 13 | general-tools | General Tools | Operational & utility |

Department cards use a single neutral design treatment — content differentiates departments, not color. This is deliberate.

### C4L integration — complete for all in-scope plugins

Nine of nine in-scope C4L plugins imported and filtered. 79 visible C4L agents across the workspace; 32 skills filtered to four future deferral surfaces with explicit destinations documented.

Per-department C4L coverage:

| Department | Visible | Imported | Filtered |
|---|---|---|---|
| Commercial | 8 | 12 | 4 |
| Corporate | 9 | 13 | 4 |
| Regulatory | 5 | 9 | 4 |
| Privacy | 6 | 9 | 3 |
| AI Governance | 7 | 10 | 3 |
| Product | 4 | 7 | 3 |
| Employment | 15 | 20 | 5 |
| IP | 9 | 12 | 3 |
| Litigation | 16 | 19 | 3 |
| **Total** | **79** | **111** | **32** |

Four departments (Public Sector, Compliance, Operations, General Tools) have no C4L coverage by design — C4L doesn't ship plugins for those practice areas.

### C4L pattern taxonomy (documented in docs/C4L_DEFERRED_SKILLS.md)

Five canonical filter patterns:
1. **Router skills** (two flavors: user-facing routers + skill-to-skill delegation helpers) → defer to Workflows
2. **Onboarding skills** (cold-start-interview) → defer to admin configuration
3. **Reconfiguration skills** (customize) → defer to admin configuration
4. **Matter management skills** (matter-workspace) → defer to admin workspace management
5. **Reference/framework skills** (user-invocable: false; loaded by other skills) → defer to skill library (present in 6 of 9 plugins audited; not universal)

Plus:
- **Multi-mode action skills** (cease-desist send/receive, takedown send/respond/counter, claim-chart multi-axis, etc.) — NOT a filter pattern; imported as plain agents with mode flags. Clarifying note in the doc.
- **Tracker-shape skills** — three structural forms documented:
  - **Form 1 — single multi-mode skill** (corporate-legal pattern): one skill operates a YAML state file via multi-mode commands
  - **Form 2 — tracker pair** (employment-legal pattern): two skills work together on a shared state file
  - **Form 3 — tracker cluster** (litigation-legal pattern): 5+ skills coordinate over a shared state file plus per-domain-object directories; CRUD-like surface

Six plugin-level non-skill directory conventions catalogued: agents/, hooks/, references/, data/, logs/, content-storage subdirectories.

### Tracker-UI migration roadmap (when the tracker UI surface is built)

Three ranked candidates for the first migrations:

1. **Litigation matter portfolio (form 3 — tracker cluster)** — strongest overall candidate; multi-skill surface naturally maps to a CRUD UI for a Matter domain object
2. **AI Governance ai-inventory (form 1)** — leading single-skill candidate; EU AI Act per-system inventory with rich tabular structure
3. **IP portfolio (form 1)** — runner-up single-skill candidate; IP portfolio (registrations × jurisdictions × renewal dates) is naturally tabular

### User preferences foundation

Dedicated `user_preferences` table (key/value/JSONB with RLS owner-only, unique on user_id+key). Migration 0025. First consumer: collapsible sections per-department per-user. Architectural choice: dedicated table over JSONB blob on users for concurrent writes, indexability, and self-documenting schema.

### Read-only inspection panel

Info icon top-right on every agent card (hover-reveal). Click to open a slide-over from the right showing the full system prompt with copy button, source attribution badge, and metadata. Applies uniformly to Canonical and C4L agents. Lazy-fetched heavy fields to keep launchpad queries fast (`getAgentDetailsAction`).

### Other architectural decisions locked

- **Multi-source provenance:** `source_origin` format `"<source-id>:<plugin>/<skill>"`, designed for future Stanford CodeX / firm-internal / etc. sources
- **Hybrid edit enforcement:** UI uses `readOnly` attribute on text fields and `disabled` + hidden inputs on switches; server action does field-by-field equality compare against DB, rejects if locked field changed
- **Sync pattern:** Manual import (Shape A) validated; future Shape B (GitHub Action auto-PR on upstream changes) deferred until manual is proven
- **Sort_order discipline:** Two-phase shuffles when reordering (temp values → final values) to preserve logical uniqueness even though no UNIQUE constraint exists on the column

## Polish phase (HISTORICAL)

The polish phase ran from the creation of the polish list through polish #17 (sequenced roadmap construction). All 17 items are resolved: #1-#15 and #17 are CLOSED with their resolutions documented below; #16 (em-dash sweep across remaining marketing pages) became roadmap item 11 and is tracked there. #14 (agent placement audit) remains a recurring discipline with no current action. The "Workspace home and rail restructure" arc that followed the polish phase is also closed (six stages shipped; see the arc section below). The polish list below remains as a historical record of the phase's scope; active and pending work now lives on the roadmap at docs/ROADMAP.md.

### Polish list (17 items, in priority/sequence order)

1. **Rail group collapsibility — CLOSED via commits d0cce05 + 156930c.** Sibling CollapsibleRailGroup component parallel to the launchpad pattern; ChevronDownIcon, 200ms duration, force-expand-when-active as default-not-lock (tri-state userToggle resolution: user-toggled wins; else force-expand-when-active applies; else persisted preference). isLeafActive helper in lib/workspace/rail-active.ts. railGroupsCollapsedKey preference. motion-reduce:transition-none and aria-controls retrofitted on both surfaces.

2. **Card affordance consistency between department and agent cards.** Resolved in commit cfb8174 via Option (a): the pencil-icon visibility on department cards was brought into parity with the agent-card kebab visibility model (`opacity-40` at rest, brighten on hover, brighten on focus-within, shared bare `transition-opacity`). Trigger-shape symmetry (pencil vs. kebab) was deliberately NOT pursued because the department card has exactly one admin action today (Edit description), making a kebab-with-one-item a UX regression vs. the direct pencil affordance (2 clicks vs. 1).

   Future revisit: when a second department admin action lands (e.g., rename department, archive department, manage department agents from the card), the kebab swap becomes the right call — at 2+ actions the kebab earns its weight. Add the second action as part of that future scope; the kebab refactor follows.

3. **Delete-dialog C4L copy — CLOSED via commit 7bfe669.** Three-variant branching by source_origin: Canonical keeps the forked-copies-unaffected reassurance; C4L drops it (sentence-case title "Delete Claude for Legal agent?"); personal agents unchanged. The agent prop type in agent-card.tsx now threads source_origin; isC4L is derived at the dialog level; isAdminMode + isC4L combine to select among three title + body variants.

4. **Composer model picker C4L — CLOSED via commit a4ba709.** Mirrored updateAgentAction's permission gate into updateAgentModelAction so admins can change models on C4L (and Canonical) agents from the chat composer, matching the edit-form behavior. Four places in lib/actions/agents.ts now use the same gate vocabulary verbatim (updateAgentAction, updateAgentModelAction, softDeleteAgentAction, restoreAgentAction). Stale doc-comment forecasting this as "deferred to a session that loosens the form action in the same pass" was updated; the deferral has been completed.

5. **Sort_order normalization after C4L filtering — DROPPED as no-op.** Resolved by investigation in this session: sort_order is never rendered in the UI (it's purely an ORDER BY column in `getAgentsForDepartmentLaunchpad`), so the gaps left by soft-deleted C4L rows are invisible to users. Any normalization migration would also be undone by the next C4L re-import — the import script (`scripts/import-c4l-plugin.ts`) reassigns sort_order from `100 + index` on every upsert. Modifying the import script to preserve normalized sort_orders would introduce real branching complexity to a currently-clean idempotent script, for zero observable benefit. If a future feature ever surfaces sort_order visually (drag-handle position pickers, sortable lists, tracker-UI position indicators, etc.), that feature handles normalization in its own scope.

6. **Reorder docs/C4L_DEFERRED_SKILLS.md sections — DROPPED as low-value churn.** The current ordering (per-plugin filter sections, then pattern observations) reads logically even though pattern observations aren't perfectly clustered. Reordering for aesthetic consistency would generate commit churn (the file has been edited in eight separate commits across the C4L import arc) without changing how the doc functions as authoritative reference material. If the doc later grows substantially or someone reading it fresh reports the ordering is confusing, revisit; until then, the structure is fine as-is.

7. **Department description copy consistency — CLOSED via commit 94ddcc0 + migration 0041.** Updated descriptions on four departments to sentence case and removed cross-department overlap: Commercial drops the AI-Addenda mention (no such agent exists; AI work lives in AI Governance regardless); Public Sector removes "regulatory affairs" overlap with Regulatory; Operations reframes around the legal team's own ops (not "corporate transactions"); General Tools replaces "agentic" jargon. Both the migration and the seed file (supabase/seed/0001_org_and_departments.sql) are updated; fresh setups produce same state.

8. **C4L plugin-level directory conventions concept review — CLOSED via commit 29e51a4.** Investigation replaced speculation with verified evidence in docs/C4L_DEFERRED_SKILLS.md. Three factual corrections: data/ (employment-legal) is empty placeholder scaffold, not static data tables; logs/ exists in both ip-legal AND commercial-legal (not just ip-legal); references/ is plain markdown shared-context docs distinct from Pattern #5 reference/framework SKILL files. Litigation-legal's matters/_log.yaml flagged as the single most valuable design reference across all nine plugin imports — a free 50-line schema spec for the Matter portfolio data model that the future tracker-UI work should reference rather than reinvent.

9. **Out-of-scope C4L plugins (law-student, legal-clinic, legal-builder-hub, cocounsel-legal) — DEFERRED pending broader infrastructure.** Resolved via strategic discussion in this session:

   - **Product positioning:** legalOS is broader than in-house counsel — academic, clinical, and other legal segments are in scope long-term, with the option to pare focus down later if data justifies it.
   - **The four plugins map to two different futures.** law-student (13 skills: bar prep, case briefing, IRAC grading, etc.) and legal-clinic (16 skills: clinic intake, case memos, pro bono workflows, etc.) are user-segment content that belongs in a NEW content tier — a separate rail group with a separate entity type, NOT additional departments. Mixing academic/clinical content into the Departments group would dilute both the in-house product and the academic/clinical surface. legal-builder-hub is meta/registry content (a community-skill marketplace) that would surface alongside admin tooling. cocounsel-legal is a Thomson Reuters MCP partner integration that belongs in the Integrations tier.
   - **Why deferred:** All four require infrastructure that doesn't exist today. The non-department content tier (new rail group, new entity type with its own schema, RLS policies, launchpad-equivalent surface, agent attribution model) is real work — disproportionate to host 29 skills from two C4L plugins with zero current users in those segments.
   - **Trigger conditions for revisiting:** Either (a) the first real user from an academic or clinical segment signs up and demonstrates demand, OR (b) the broader product strategy explicitly requires marketing-visible content for those segments before users arrive.
   - **Documented in the deferred-work section:** Non-department content tier (new rail group + entity type) for academic/clinical/external C4L content. See "Deferred work explicitly punted" below.
   - **Codified in DECISION_LOG.md as D-051** (Out-of-scope C4L plugins deferred pending non-department content tier).

10. **Workspace hero refinement — CLOSED via commit 8d67187.** Title size reduction text-[52px] → text-[44px] on both workspace-hero.tsx and department-header.tsx (typography parity preserved between landing hero and per-department headers by deliberate design). Subline updated to rail-aligned framing: "Your team's departments, knowledge, workflows, and integrations, all in one place." Doc-comment quoting the old subline updated for accuracy. max-w-[28ch] on the hero and max-w-[22ch] on department-header unchanged (the differing character ceilings are intentional).

11. **Agents/ directory listing cleanup in docs/C4L_DEFERRED_SKILLS.md — CLOSED via commit f205623** (with reservation-slot fill at commit a5eda69). The pre-existing listing incorrectly included privacy-legal in the "WITH agents/" list and predated the ip-legal and litigation-legal plugin audits. Corrected listing: 7 of 9 plugins HAVE agents/ (commercial-legal, product-legal, corporate-legal, employment-legal, regulatory-legal, ip-legal, litigation-legal); 2 of 9 do NOT (privacy-legal, ai-governance-legal). Verification timestamps added in the doc per the pattern established in commit 29e51a4.

12. **C4L agent fork behavior — VERIFIED and intentional.** Investigated in this session: the fork affordance (`Customize` button in the chat surface for non-admins) renders and works correctly for C4L agents today, symmetric with Canonical template fork behavior.

    **Verified end-to-end behavior on a C4L fork:**
    - The Customize button renders for non-admin viewers on C4L agents (admins see Edit, which opens the hybrid-edit form instead).
    - The server action `forkAgentFromConversationAction` allows the fork — no source_origin filter; C4L templates pass the same validation gate as Canonical templates.
    - The forked copy lands in the user's My Agents bucket with `is_template=false`, `created_by=<userId>`, `source_origin=NULL` (the C4L provenance is intentionally severed at fork time), and `forked_from_agent_id=<original-C4L-id>` (DB-level lineage preserved).
    - The forked copy is fully editable by the owner — no hybrid-edit constraints apply because it's now a personal agent, not a C4L-managed one.

    **Design clarification — admin-vs-non-admin-forking inversion is intentional, not a bug.** Admins editing a C4L agent in-place are constrained by hybrid-edit (only model, references, and export_format are editable; name, description, system_prompt, web_search are locked because they're managed upstream by Anthropic). Non-admins forking the same C4L agent get full edit freedom on their personal copy. This looks like an inversion ("non-admins have more flexibility than admins?") but is correct by design: the hybrid-edit constraint exists to preserve upstream-managed C4L content while it's still C4L-managed; forking explicitly opts out of that management and creates an independent personal artifact. Admins who want full edit freedom can also fork — the affordance is available to them too via the same path.

    **Latent default_output_format bug fixed in passing.** The fork action was hardcoding `default_output_format: "markdown"` instead of preserving the source's value. Today this is a no-op (all Canonical and C4L sources use markdown), but it would silently flip on any future non-markdown source. Fixed in commit 4129375 to use `source.default_output_format ?? "markdown"`. Independent of the C4L question; surfaced by the investigation.

    Polish #12 closes by verification — no behavioral fix required for the fork affordance itself.

13. **Documentation and external-facing copy refresh — CLOSED via Stages 3a through 3h.** Ten-stage arc updating the entire doc estate to post-polish-phase reality. Stages: 3a (cleanup deletions: skills-checklist.md, PHASE_0_SYNCBACK_TODO.md, commit 9c4bcf8); 3b1 (CLAUDE.md refresh: 13 departments, three-tier architecture, polish phase, high-signal directory structure, commit ad9e5d6); 3b1.5 (CLAUDE.md analytics-row correction, commit aa3cb5f); 3b2 (PROJECT_OUTLINE.md refresh: largest single commit in the arc with Phase 3/4/8 retired to supersession notes, commit eec1710); 3c (DECISION_LOG.md appended D-050 and D-051, commit 0f70f75); 3d (README.md surgical staleness fix, commit f6bfb33); 3e (marketing copy delight pass on /pricing, /integrations, /security, /mission, commit 88e296d); interlude (em-dash convention recorded in CLAUDE.md; polish #16 added for retroactive sweep; roadmap construction renumbered to #17, commit 5080af1); 3f (docs/AGENT_ARCHITECTURE.md replaced with redirect stub: 404 lines → 12 lines, commit f2b0d7b); 3g (CHANGELOG.md polish-phase entry, commit 37e4c9e); 3h (this commit, CHATBOT_HANDOFF.md self-refresh — final stage).

14. **Agent placement audit — verify every Canonical agent is in the right department under the current 13-department taxonomy.** During polish #7's agent census investigation, the AI Addenda agent originally raised as a candidate for migration from Commercial to AI Governance was confirmed not to exist today (a "Blank Agent" template exists in Commercial, but no AI Addenda agent). No current misplacements were identified. This polish item formalizes the audit as a recurring discipline: whenever new Canonical agents are authored, or when the C4L plugin landscape shifts, re-run the agent census query (see commit history for the SQL) and confirm placement is still correct. Today: no action needed. Future: re-audit whenever taxonomy or agent inventory changes meaningfully.

15. **Button and card hover-effect refinement — CLOSED.** Iterative work refined the hover-and-press feel across card surfaces and rail links. Eight commits across the arc:
    - Stage 15a (commit af51229): motion tokens added to globals.css @theme inline (--ease-soft, --ease-spring, --duration-hover, --duration-press)
    - Stage 15b (commit 1baff78): three card surfaces (department, agent, locked-department) converted to consume tokens; press feedback added; motion-reduce guards added
    - Stages 15e iterations 1-4 (commits 7397370, 29148f0, d709ddf, cd2c867): four rounds of live token tuning to land on the right hover feel; final values --ease-soft cubic-bezier(0.23, 1, 0.43, 1), --duration-hover 360ms, --ease-spring cubic-bezier(0.34, 1.4, 0.64, 1), --duration-press 150ms; iteration 4 added --duration-release 80ms and --ease-release cubic-bezier(0.25, 0.46, 0.45, 0.94) for asymmetric press timing
    - Stage 15f (commit 66b85a8): three-zone timing pattern applied to cards — base transition uses release tokens (fast snap on click-release and mouseleave), hover state uses hover tokens (soft glide), active state uses press tokens (springy compression)
    - Stage 15d (commit c765878): six rail surfaces (link, locked link, brand mark in workspace + admin rails, profile block, collapsible group caption + descendant span) converted to the same three-zone pattern

    Stage 15c (button base conversion) was not pursued — the cards and rail refinements were sufficient for the operator's "springy and soft" target. Button refinement deferred unless and until a specific need surfaces. The motion tokens are available for future button conversion if desired.

16. **Em-dash sweep across external-facing copy — COMPLETE (verified 2026-06-07).** Originally added mid-polish for retroactive em-dash cleanup and at one point tracked on the roadmap (a pointer later broken by roadmap renumbering). A full grep of the public surface on 2026-06-07 found the 6 marketing pages once flagged (about, blog, contact, documentation, faq, legal) already clean — their em-dashes left when they were converted to the shared coming-soon template — and the last user-facing stragglers (the landing page's metadata title and the root layout's metadata description) were fixed in the Trust Center commit (D-126). Internal docs and code comments stay out of scope per the convention's external-only framing; the ban itself remains a standing convention in CLAUDE.md for all new copy.

17. **Sequenced roadmap construction — CLOSED via this commit.** Final polish item by design. Took the accumulated deferred-work list plus operator-surfaced items from the polish phase and the Workspace home and rail restructure arc, sequenced them into operator-prioritized order, and stored the result as docs/ROADMAP.md. The roadmap supersedes this handoff's deferred-work section (now a pointer to the roadmap). 20 prioritized items + 9 backlog items at time of creation. Reordering the roadmap is normal work; this closure covers the initial construction, not ongoing maintenance.

### Sequencing decision locked

Work the polish list in approximately the order listed (Option B from the prior discussion: highest user impact first). Rail collapsibility (#1) was the start. Doc refresh (#13) closes substantive content polish; sequenced roadmap construction (#17) is the genuine final item by design — it depends on docs being current per #13 and the em-dash sweep per #16.

Slot #11 was originally held for surfaced items during polish and was filled with the agents/ directory listing cleanup. Polish #16 (em-dash sweep) was added mid-polish per the same surfaced-items pattern; new items are still added when they surface.

### Steps 3 and 4 (after polish)

After the polish list is complete:

- **Step 3:** Out-of-scope C4L plugins (law-student, legal-clinic, legal-builder-hub, cocounsel-legal) remain deferred per D-051's trigger conditions (academic/clinical user demand OR strategic-priority signal). Revisit if/when a trigger fires; otherwise proceed directly to Step 4.
- **Step 4:** Move to a new product capability entirely. The architecture is mature enough to support new directions. Operator's call which direction.

## Recent cleanups outside polish list

- **Locked-department dialog centering (commit 112d5c9).** Native HTML <dialog> element rendered pinned to top-left of viewport instead of centered. Cause: Tailwind v4 Preflight zeroes margin: auto on dialog elements, breaking the UA stylesheet's centering mechanism. Fix: added explicit transform centering classes (fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2) matching the shadcn DialogContent convention used elsewhere in the codebase. Backdrop dimming was already working and was not affected.

  Forward-looking note: any future native <dialog> in this codebase will hit the same Preflight wall. Copy the centering pattern from this fix or from components/ui/dialog.tsx rather than relying on UA defaults.

## Arc: Workspace home and rail restructure (CLOSED)

A real product redesign of the workspace navigation and home page, treated as its own multi-stage arc rather than a polish-list item (matching the framing used for polish #13's multi-stage doc refresh). The arc reshaped the entry-point experience: a personalized home replaced the static department grid at /workspace, the rail's "Workspace" group dissolved into a brand mark at the top, rail group headings became clickable navigation links to their own landing pages, and the rail gained a three-tier active-state model (leaf full active, ancestor caption shift, group-landing full active).

Six stages shipped:

1. **Coming-soon landing pages — CLOSED via commit 2a98a62.** Four new routes at /workspace/knowledge, /workspace/workflows, /workspace/integrations, /workspace/help, each a header (h1 + description) over a card grid of children. New ComingSoonCard component distinct from LockedDepartmentCard ("hasn't shipped yet" vs "you can't access this"). Existing leaf pages (My Workflows, Connections, Guides) moved to nested paths /workspace/<group>/<leaf>. RESOURCE_GROUPS leaf hrefs and ROUTE_TABLE breadcrumb entries updated. D-048 stays in effect for individual leaf surfaces (the centered ComingSoonContent splash); the arc added a parallel group-landing pattern.

2. **Workspace restructure, home + departments split (bundled) — CLOSED via commit bee4ca0.** Department grid moved from /workspace to /workspace/departments (page-level h1 + description + right-aligned count; DepartmentGrid lifted to purely presentational). /workspace became the personalized home: HomeHero with a first-name greeting (new getFirstName helper in lib/workspace/profile.ts; slate-blue, fallback to a no-name greeting) plus a no-access branch with a mailto Request access CTA; Continue working (3 most recent conversations via conversations.updated_at, first user-message snippet truncated to 60 chars); Recently used (5 most recently used agents via the usage_events ledger, filtered by current access); Browse all departments card. Empty states always visible. Suspense boundaries with skeleton loading. WorkspaceHero and workspace-modules.tsx deleted. Migration 0042 added the conversations(user_id, updated_at desc) index; the chat route now bumps conversations.updated_at on message insert. Breadcrumb routes and revalidation paths updated.

3. **Rail header restructure — CLOSED via commit 336c18c.** Removed the redundant "Workspace" single-link group; the dot + wordmark brand mark already at the top of the rail is the canonical /workspace entry point. Admin rail's "Admin" single-link group preserved (it points to /workspace/admin, a distinct destination, so it is not redundant).

4. **Rail group click model — CLOSED via commit 41302a1, with chevron-position correction 0595b0e and navigation-responsiveness follow-up 93a2683.** CollapsibleRailGroup refactored to a split-control model: the caption is a WorkspaceNavLink to the group landing, the chevron is a separate button for expand/collapse. New required captionHref prop (sourced from an explicit landingHref per group in workspace-rail.tsx). forceExpanded extended to treat the group landing as a force-expand trigger via isLeafActive's exact-match mode. New disclosure-chevron hover affordance: 28px square hit area, subtle bg-hairline fill on hover, polish #15 asymmetric motion tokens (release timing at base, hover timing + ease-soft on hover). Launchpad CollapsibleSection caption brought up to polish #15 timing tokens for parity; the launchpad chevron deliberately keeps no hit-area fill (different interaction model, the whole header is the toggle, and its flush-left layout cannot absorb a 28px hit area without shifting every title). The correction commit moved the chevron to the right of the caption per the original arc spec (caption is primary nav, chevron is secondary disclosure). The follow-up added app/workspace/loading.tsx: a rail-aware skeleton (h1 + description bar over a card grid) that paints instantly on every workspace navigation, replacing the "frozen old page" sensation. That latency is pre-existing: the workspace layout renders dynamically and runs ~3 sequential supabase.auth.getUser() calls plus table reads on every route's critical path, and with no loading boundary prefetch could not pre-render the dynamic destination. Stage 4 surfaced it by adding caption click targets; loading.tsx addresses the perceived latency. The deeper auth-stack fix is deferred (see the deferred-work section).

5. **Active state model — CLOSED via commit da01ee4.** New isAncestorActive helper in lib/workspace/rail-active.ts, sibling to isLeafActive. URL prefix match (pathname starts with captionHref + "/") with an explicit equality guard: the exact landing returns false because that is the higher full-active tier, resolved by WorkspaceNavLink's activeClassName. Three-tier active state: leaf full active (sidebar-primary fill) > ancestor caption shift (text-caption to text-foreground, no fill) > default. The caption applies the ancestor class on its inactive className only, so full active still wins on the exact landing. The forceExpanded comment was refreshed (it had described ancestor-active as a later stage's concern; that stage shipped here, and forceExpanded intentionally keeps its narrower exact-landing-plus-leaves match rather than the broader ancestor check).

6. **Cleanup and closure — CLOSED via this commit.** Doc closure: this arc section migrated to closed form with per-stage commit shas; six deferred items recorded in the deferred-work section (since migrated into docs/ROADMAP.md by polish #17); "How a fresh chat opens" updated to the post-arc state; a comprehensive CHANGELOG entry. No code changes in this stage; the arc's substantive work completed at Stage 5.

Each stage committed independently; Stage 2 was intentionally bundled because the move-out and the new-content-in were tightly coupled (decoupling would have created a broken intermediate /workspace state). Migration 0042 was applied to the live database via the dashboard SQL editor, with no separate migration-application commit.

## Arc: Chat page redesign (CLOSED)

An eleven-commit product redesign of the agent chat surface at /workspace/agents/[id], treated as its own focused arc (matching the framing used for the Workspace home and rail restructure arc). Claude.ai was the reference for a modern chat surface. The arc reshaped the surface: a vertically centered empty state, a focused header, a polished composer, smooth paced streaming, a branded thinking indicator, a unified send/stop control, consolidated secondary actions, and a consistent quiet-action visual language across every chat affordance.

Eleven commits shipped:

1. **Structural redesign — 5ea1507 (commit 1).** Vertically centered header + composer in the empty state; dropped the "Department Agent" pill and the model-name line from the header; demoted Edit; inverted the keyboard contract to Return-to-send + Shift+Return-for-newline (D-052); removed the persistent composer hint; polished the model selector to a sentence-case pill.
2. **Polish pass — 2321765 (commit 1.5).** Empty-state content shifted up to ~35-40% from the top; header border removed in the empty state and matched to composer width via the max-w-3xl content row; fade-in-up on the empty-to-active transition; contextual Esc-to-stop hint during generation only.
3. **ThinkingGlyph — 711d746 (commit 1.6).** Pulsing concentric-circles ThinkingGlyph replaces the three-dot indicator (brand continuity with the landing page); fixed a ~52px column-misalignment bug via the mx-auto max-w-3xl wrapper; reused the landing-ring-pulse keyframe.
4. **Polished send button — 1bbdce3 (commit 2).** Solid primary-blue circle with a white upward arrow; polish #15 motion tokens. The concentric-circles motif was intentionally NOT used here, per D-053.
5. **Composer text alignment — 276b766.** Composer card shifted left by -ml-3 to align its text with the header text and the assistant prose left edge.
6. **Send button state polish — 168741b.** Send button stays solid primary across all input states; hover lifts brightness rather than darkening, matching Claude.ai.
7. **Streaming pacing — 9cad674.** New usePacedText hook (requestAnimationFrame proportional drain) decouples display cadence from network chunking; flush-on-done/abort/unmount preserves the tail; flush-before-source-events keeps citations anchored; reduced-motion bypass.
8. **Streaming transitions — d07739b.** User-message entrance animation; persistent static ThinkingGlyph below the latest completed response; pacing-speed tune (divisor 8 to 5).
9. **Unified action row — 7646c1b.** Send/stop unified in one circle via color inversion; floating bottom-center scroll-to-bottom affordance; Copy button on completed assistant messages.
10. **Action row consolidation — 063e77d.** Copy + Download consolidated into one always-visible icon-only action row at the bottom-left of completed assistant messages.
11. **Refined Edit + secondary-action color consistency — 1850769.** Edit reverted to a refined text affordance; Copy and Download resting color lightened to text-caption; all three secondary actions share the text-caption-to-text-foreground treatment with polish #15 motion tokens.

Patterns established:

- **Brand-scarcity principle (D-053).** The concentric-circles motif is deployed only at high-impact moments (landing page + thinking indicator), never as decoration on common UI.
- **Secondary-action visual language.** text-caption at rest, text-foreground on hover, with polish #15 motion tokens; applied across Edit, Copy, and Download.
- **Streaming text pacing via usePacedText.** Decouples network arrival from display rendering; reusable for any future paced-text surface.
- **Unified send/stop affordance via color inversion.** Same circle shape and position; the colors invert while generating.
- **Return-to-send keyboard contract (D-052).** The standard chat keyboard contract across the product going forward.

Two decision-log entries were adopted during the arc: D-052 (Return-to-send keyboard contract, reversing the Session 17b ⌘+Return decision) and D-053 (concentric-circles brand-scarcity principle). Full commit-by-commit detail is in CHANGELOG.md.

## Arc: Share & connector hub (CLOSED)

The connector hub is SHIPPED. This arc built the workspace-level connections foundation and the first provider end to end (Google Drive), then wired live Drive reads into agents and a Drive file picker into the chat composer. Decisions D-062 through D-072 were adopted across the arc.

What shipped:

- **Settings as a peer mode** to workspace and admin (D-062). A capability-grouped Connections page (D-063) with a provider-agnostic visual taxonomy.
- **Connection data model** (D-064): `connections` + `connection_grants` + `connection_policy` tables, with RLS, extensible across capabilities. Migration 0044. Migration 0045 added `connection_secrets`. Migration 0046 made `message_attachments` Drive-ready (schema + send plumbing) to match agent attachments (D-068).
- **Google Drive OAuth** end to end (D-065): a provider-agnostic provider registry plus a Drive adapter, a single provider-agnostic callback at `/api/connections/callback`, and encrypted tokens in `connection_secrets` via app-level AES-256-GCM. A token-exercise layer refreshes on expiry.
- **Connection policy enforcement** in a shared layer (D-066): `canExerciseCapability`, govern-before-exercise. The admin editing UI to edit allowed categories / providers and the capability ceiling is DEFERRED to the Admin polish arc; until it ships, the single `connection_policy` row is edited directly in the database.
- **Live Drive reads in agents** (D-067): `resolveAttachmentText` reads the file at the current version at agent run-time, with native-format export (Docs to DOCX, Sheets to XLSX, Slides to PDF) via a format-aware content client.
- **The Drive file picker in the chat composer** (D-069 listing/search layer, D-070 picker): search plus folder browse, opening to recents, with skeleton-on-open loading and a skeleton-to-content cross-fade.
- **Routing cleanup** (D-071): retired the legacy `/workspace/integrations` route in favor of `/workspace/settings/connections` as the canonical connections home, with a redirect for old links.

CRITICAL fact for any future session: the M4b OAuth `invalid_client` failure was RESOLVED. The cause was a stale / mismatched client secret; the fix was generating a fresh client secret in Google Cloud for the same OAuth client and setting it in Vercel. Drive connects and reads live successfully in production. Any older reference to `invalid_client` is HISTORICAL, not current.

Google Cloud setup: a Workspace Cloud org was provisioned. The OAuth consent screen is Internal (no verification friction, no 7-day refresh-token expiry). Scope is `drive.readonly`. Env vars `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `CONNECTION_TOKEN_ENCRYPTION_KEY`, and `NEXT_PUBLIC_SITE_URL` are set in Vercel and in `.env.local`.

Migration workflow reminder: migrations are applied BY HAND in the Supabase SQL Editor (the repo is intentionally unlinked; never `supabase db push`). Migrations 0044, 0045, and 0046 are all applied and verified live.

Strict A held the entire arc: no admin pages were modified. The Admin polish arc is the deferred next follow-up (roadmap item 1).

Deferred connector follow-ups (tracked on the roadmap, not lost): the agent-form Drive picker (reuses the composer picker; depends on the agent edit page rendering `gdrive_link` attachments gracefully first); the admin connection-policy editing UI (Admin polish arc); Calendar and Gmail connectors (each a new provider adapter reusing the OAuth flow, single callback, token-exercise layer, and listing layer; the home's dormant Today and Matters views light up when these land; the Calendar / Gmail / Slack Connect CTAs on the Connections page are currently inert); and Drive picker refinements (pagination and scoped-in-folder search).

## Arc: Workspace home revamp and Matters (CLOSED)

A 29-commit arc (60b9e3a through f47942e) reshaping the workspace home from a launcher into a value-mirror of the user's actual work, with honest empty states. The home now answers a single identity question: it reflects what the product is for (agents, matters, impact, your day), not peripheral plumbing or rail-duplicating navigation (D-056).

Final home spine, top to bottom: an editorial greeting, a two-column Today and Impact row, Matters, and Desk (the empty-state reading section).

Work, grouped:

1. **Home composition.** Editorial greeting replaced the prior hero; Recently used and Browse all were removed (the department directory stays at /workspace/departments). Section headings unified to a single-word family at 18px medium (Today, Impact, Desk). Token-hygiene and accessibility-label sweep across the home. The breadcrumb's first segment renamed from "workspace" to "home" via a shared HOME_SEGMENT constant.
2. **Impact band.** Reads real usage_events for Agent runs and Top agent behind a Week/Month/YTD toggle (all three windows pre-fetched server-side). Hours saved and Estimated cost saved show an honest Setup-needed state with admin-gated CTAs, because the calculator's task book is still localStorage, not the database (D-059). Stats reflowed to a 2x2 grid for the half-width column; the toggle sits on the section heading row; row height compressed.
3. **Connected-state gating (Reading-1 pattern, D-057).** The Today card (calendar) and the Matters section (CLM / matter management) each ship their full rich connected view, built and typed, gated behind a connection check that returns false. The honest Connect placeholder is the only state any user sees today; the rich views are unreachable until the gates flip. Today renders a day's schedule; Matters renders a four-stat row, matter rows with type badges and stage-progress indicators, a Mine/Team/All scope toggle, and a footer. Both render from typed shapes via data fetchers that return empty/null now (D-058).
4. **Removals, retained unmounted.** The Recent section (formerly Continue working) and the Tools section (Slack/Mail/Drive launcher) were removed from the home. Their components (ContinueWorkingSection; IntegrationsRow, IntegrationCard) are retained unmounted with retention notes, the same discipline as sparkline.tsx. Recents feeds the future Recents panel (roadmap item 9); the Tools components may return as a connection-status strip (D-061).

Decisions adopted: D-056 (home as value-mirror with honest empty states), D-057 (Reading-1 build-and-gate pattern), D-058 (typed connection-helper pattern), D-059 (calculator stays localStorage for v1), D-060 (no serif), D-061 (Tools removed, status-strip may return).

What flips the dormant gates live: the Share and connector hub builds the OAuth/integration layer that sets isCalendarConnected and isMattersConnected true, at which point Today and Matters render real data with no further UI work. The connector hub has since shipped Google Drive OAuth and live Drive reads; the Calendar and Matters home gates stay dormant until their own connectors land.

Working lessons carried forward this arc:

- Migrations and the code that depends on them ship together, or the schema change lands first; never a commit that references a column or table that does not exist yet.
- Verify the push reached origin/main before reporting work as shipped, and for this project confirm the production deployment reached READY on the canonical domain. Prod is the operator's review surface; "pushed" is not "visible," and a commit that is gated dormant (no visible change) must be called out as such up front.
- Honest-state discipline: no dummy data is shown to users. Surfaces without real data show a Connect placeholder or an empty state, never fabricated content.
- Prompts to the coding agent are plain and terminal-safe: no nested code fences, no backtick-wrapped className strings, no characters a shell or terminal mangles.

## Key files and architectural anchors

For the fresh chat to know where things live:

- `components/workspace/agent-card.tsx` — agent card component (kebab, info icon, fork affordance live here)
- `components/workspace/department-card.tsx` — department card (pencil icon for description edit; kebab swap deferred per polish #2 until a second admin action lands)
- `components/workspace/department-launchpad-content.tsx` — three-tier launchpad rendering
- `components/workspace/agent-details-panel.tsx` — slide-over read-only inspection
- `components/workspace/collapsible-section.tsx` — per-section collapsibility on the launchpad
- `components/workspace/workspace-rail.tsx` — the sidebar rail (rail collapsibility shipped per polish #1)
- `app/workspace/page.tsx` — the workspace home composition (greeting, Today and Impact row, Matters, Desk)
- `components/workspace/home/` — home section components: home-greeting, calendar-connect-card + today-schedule (the Today card and its dormant schedule view), impact-band + impact-band-client + impact-cell + timeframe-toggle, matters-section + matters-connected (the Matters placeholder and its dormant rich view), reading-section; retained unmounted: integrations-row, integration-card, continue-working-section, sparkline
- `lib/workspace/home/` — home data and gates: impact-math (usage_events queries), calendar-connection (isCalendarConnected, getTodaysEvents, NormalizedEvent), matters-connection (isMattersConnected, getMatters, getMattersSummary, Matter, MattersSummary)
- `/workspace/settings/connections` — the Connections page (Settings peer mode, capability-grouped); `/api/connections/callback` — the single provider-agnostic OAuth callback (both are confirmed routes; the legacy `/workspace/integrations` route was retired, D-071)
- The connector layer (the connections lib domain): provider registry + Google Drive adapter, the token-exercise layer (refresh-on-expiry), encrypted-secret storage (AES-256-GCM into connection_secrets), the policy enforcement layer (canExerciseCapability, govern-before-exercise), the Drive listing/search layer, and the live-read content client (resolveAttachmentText, native-format export Docs to DOCX / Sheets to XLSX / Slides to PDF)
- The Drive file picker in the chat composer (`components/chat/`): search + folder browse, skeleton-on-open loading with cross-fade
- `lib/auth/access.ts` — the project's primary cache-wrapped access layer
- `lib/agents/source.ts` — `parseSourceOrigin`, `getSourceDisplayLabel` for C4L attribution
- `lib/preferences/keys.ts` — user-preferences key registry; `deptCollapsedSectionsKey`, `CollapsedSectionsValue`
- `lib/preferences/types.ts` — preference value type definitions
- `lib/actions/agents.ts` — the agents server-actions module
- `lib/actions/agent-details.ts` — lazy-fetch for read-only inspection
- `lib/actions/user-preferences.ts` — preference get/set server actions
- `scripts/import-c4l-plugin.ts` — the C4L import script (operator runs manually)
- `docs/C4L_DEFERRED_SKILLS.md` — authoritative reference for every C4L skill audited, where it landed, and why
- `docs/REBRANDING.md` — the bounded checklist for changing the product name or domain (name = display-text find/replace; domain = one env var `NEXT_PUBLIC_SITE_URL` plus updating OAuth redirect URIs in the external provider consoles; architecture/secrets unaffected). The name and domain are placeholders today, so a future session will likely need this.
- `docs/PHASE2_MCP_TOOLUSE.md` — the AUTHORITATIVE design lock for MCP Phase 2 (agent tool-use): tool namespacing + routing, two-layer per-agent governance, v1 run-reads/block-writes policy, the iteration/wall-clock guards, token accounting, tracing, the 7-step build order (2P-1 … 2P-7), the gating principle, and the history-replay correctness trap. Every Phase 2 step built to this spec (D-100). MCP Phase 2 is COMPLETE: an agent connects a trusted MCP server and uses its tools mid-conversation, with read tools auto-running and write tools pausing for per-action human approval (the full 2P-1 through 2P-7 build).
- `supabase/migrations/` — all schema changes; see the directory for the current set (latest is 0066, the connection org-scoping fix)
- `supabase/seed/0001_org_and_departments.sql` — canonical post-migrations state; comment header documents the four-group taxonomy
- `app/workspace/admin/` — the admin section: People, Policy & access, Audit log (Govern); Insights, Evals (Measure). `lib/admin/nav.ts` is the single nav source feeding the admin rail and landing.
- `lib/workspace/admin/insights/` (org-wide usage math + sample fixture) and `lib/workspace/admin/audit/` (the unified role/status audit feed) — the MEASURE/GOVERN data modules added in the admin arc.

## Migration history summary

Current HEAD on main: 0066 (the per-organization connection scoping fix). All migrations applied to the live Supabase database via the dashboard SQL editor (the project's standard migration-application path; the repo is intentionally unlinked, so never `supabase db push`). The migrations after the admin arc cover the connections BYO-model/MCP work, workflows (0060 through 0063), demo access (0064/0065), and the connection org-scoping fix (0066). The seed files in `supabase/seed/` are maintained in sync as the schema evolves.

Recent migrations of note:
- 0047 — organizations.default_model (A2b org default model)
- 0048 — role_change_enforcement trigger + role_change_audit table (A3a; tightened role-mutation RLS, closed a privilege-escalation hole)
- 0049 — user_deactivation trigger + user_status_audit table (A3b; also tightened the A3a last-super-admin count to require active status)
- 0050 — invitations table + invite-aware ensure_user_provisioned (A3c)
- 0044 — connections + connection_grants + connection_policy tables (connector arc data model)
- 0045 — connection_secrets table (encrypted OAuth tokens)
- 0046 — message_attachments made Drive-ready (schema + send plumbing)
- 0025 — user_preferences table
- 0028 — M&A renamed to Corporate (slug + name)
- 0029 — Corporate description scope expansion
- 0031 — Employment department added
- 0033 — four-group taxonomy reorder; reserved slot 3 for Regulatory
- 0034 — Regulatory added at sort_order 3
- 0036 — reserved slots 7, 10, 11 for AI Governance, IP, Litigation
- 0037 — AI Governance, IP, Litigation added
- 0041 — department description updates (polish #7: sentence-case + cross-department overlap removal)
- 0042 — conversations(user_id, updated_at desc) index supporting the home's Continue working section (Workspace arc Stage 2b)
- 0026, 0027, 0030, 0032, 0035, 0038, 0039, 0040 — C4L filter migrations for each plugin

## Deferred work

See `docs/ROADMAP.md` for the authoritative ordered list of pending work items. The roadmap covers everything that was previously tracked in this section: 19 prioritized items plus a 9-item backlog of unprioritized candidates. The roadmap file is the source of truth; reordering and adding items is a normal part of regular work.

## How a fresh chat opens

The admin arc is CLOSED (A7). Its GOVERN side is complete (Policy & access, People, Audit log) and its MEASURE side is intentionally deferred (Insights A4a a functional placeholder pending a delight pass; A4b deferred pending the business model; Evals A5 deferred as an open design question). Several arcs shipped AFTER the admin arc and are also closed: the Claude for Legal content library and the platform-owner tier; the full Workflows arc (no-code builder, deterministic engine, human-approved writes, runs and audit, starter templates); the entire public marketing surface (the Trust Center hub and sub-pages, About, Mission, Connections, FAQ, Contact, Blog, Documentation, and the Legal document drafts); demo access (a shared, seeded, RLS-isolated Demo Org with a no-email access link and reset tooling, D-132/D-133); and the multi-tenant security fix that scopes connections and the connection policy per organization (D-136). The earlier arcs remain closed too: the polish phase, workspace home and rail restructure, chat page redesign, Word export, chat attachments, workspace home revamp and Matters, MCP Phase 2, and the Share & connector hub. See the "Current state" section at the top of this file and docs/ROADMAP.md for the ordered next work: per ROADMAP, the next major arc is the Connections phase (models-as-a-connection lifecycle), and a documentation and code-health cleanup pass (ROADMAP item 6) is in progress.

A fresh chat session at this point opens to a project waiting for the operator's next direction. The chat should:

1. Acknowledge the handoff is loaded, that the admin arc is closed (GOVERN complete, MEASURE deferred), and that the current state and deferred items are captured in the "Current state" section above.
2. Confirm the operator's intent: pick up a deferred arc (the Connections phase with models-as-a-connection is the natural next major arc, and it gates the business-model arc which gates the Insights cost/ROI lens), kick off a new direction, or take a MEASURE delight/design pass (Insights A4a polish, or Evals A5 design).
3. Default to the operator's lead. Do NOT resurface the parked invite-email-domain item as if it were a bug, and do NOT request the over-permissioned Supabase MCP authorization (it was correctly declined).

Standing facts for any future session:
- The connector arc's `invalid_client` OAuth failure was RESOLVED (stale client secret, fixed with a fresh secret in Google Cloud and Vercel). Drive connects and reads live in production. Any older `invalid_client` reference is HISTORICAL.
- Invitation works in code; real sends are PARKED pending a sending domain (Resend + Supabase SMTP sender), not an app bug. See the "Parked operational item" above.
- Models can be added but not retired until model-retirement handling ships (Connections phase).

The roadmap at docs/ROADMAP.md is the authoritative source for "what's next." Reordering it is normal work. Per D-051, the out-of-scope C4L plugins stay deferred unless a trigger fires.

The fresh chat must honor the working rules from message one. One question at a time. No bundled steps. Dual-delight standard. Build for the long term.

End of handoff.
