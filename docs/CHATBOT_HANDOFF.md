# legalOS — Chat Session Handoff

This file is the bootstrap document a fresh chat session reads to come up to speed on legalOS. Read it in full before doing any work.

## What legalOS is

legalOS is an AI-native operating system for legal teams. Next.js 16 (App Router) + Supabase (Postgres with RLS) + Anthropic API. Production-shape architecture, pre-launch product.

Repo: `/Users/stevenantini/Projects/legalos`. Sibling repos used as reference material:
- `/Users/stevenantini/Projects/claude-for-legal` (Anthropic's open-source Claude for Legal — the source of C4L agents imported into legalOS)
- `/Users/stevenantini/Projects/project-kindred` (an earlier reference codebase)

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

## What's in flight — POLISH PHASE CLOSING

Polish #1 through #13 are closed; the polish phase has substantially completed its content-quality sweep across product UX, doc accuracy, and architectural decisions. Items #14 through #17 remain forward-looking (recurring discipline, iterative work, retroactive sweep, final roadmap construction). A fresh chat session opens at this post-content-polish vantage point with three remaining substantive items (#15, #16, #17) plus the recurring #14.

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

15. **Button and card hover-effect refinement — make the existing hover behavior even more delightful.** Today's hover affordances across cards (department cards, agent cards, locked-department cards) and buttons work correctly — they communicate interactivity and respond to gesture. The polish target is the *delightfulness* of the response: micro-interaction timing, easing curves, the subtle "feel" that separates a competent hover from a memorable one. Reference points: Linear's card-hover lift; Stripe's subtle button shadow shifts; Apple's spring-physics on interactive elements. Specifics TBD at the polish moment — likely an iterative session of trying refinements live, evaluating against the dual-delight standard (does it feel right; is the maintainer story clean), and locking the best version. Scope includes department cards, agent cards, locked-department cards, primary action buttons, and possibly the rail link hover states.

16. **Em-dash sweep across external-facing copy.** Em-dashes have become a recognizable AI-authored signal; the polish #13 marketing copy refresh (commit 88e296d) established the project convention to avoid them in external surfaces. Apply the convention retroactively: audit all marketing pages, the landing surface, in-product copy, and any other externally-visible string literal; replace em-dashes with commas, periods, parentheses, or semicolons as the structure requires. The 6 marketing pages not touched in commit 88e296d (about, blog, contact, documentation, faq, legal) are known to still contain em-dashes; the broader audit may surface more. This is a focused content pass with no architectural changes. Internal docs and code comments are out of scope per the convention's external-only framing.

17. **Build a real sequenced roadmap from the deferred-work list.** Once polish #1–#16 are complete and docs/external copy reflect the current state (polish #13), the existing "Deferred work explicitly punted" list (15+ items, unprioritized) becomes the input for a real sequenced roadmap — the kind of professional, maintainer-delightful roadmap top-line product organizations maintain. Items get grouped by impact tier (high-value surfaces like Tracker-UI and Workflows; mid-value items like sync pipeline Shape B and the skill library; lower-priority strategic decisions; small maintenance items). Each tier gets explicit rationale, dependencies, and rough sequencing. The outcome: a roadmap a new engineer or stakeholder can read and understand the path forward at a glance, instead of an unorganized deferred-work pile in limbo. This is the final polish item by design — it depends on having clear, current documentation (polish #13) and a complete polish-list resolution (everything before it) so the inputs to the roadmap are accurate.

### Sequencing decision locked

Work the polish list in approximately the order listed (Option B from the prior discussion: highest user impact first). Rail collapsibility (#1) was the start. Doc refresh (#13) closes substantive content polish; sequenced roadmap construction (#17) is the genuine final item by design — it depends on docs being current per #13 and the em-dash sweep per #16.

Slot #11 was originally held for surfaced items during polish and was filled with the agents/ directory listing cleanup. Polish #16 (em-dash sweep) was added mid-polish per the same surfaced-items pattern; new items are still added when they surface.

### Steps 3 and 4 (after polish)

After the polish list is complete:

- **Step 3:** Out-of-scope C4L plugins (law-student, legal-clinic, legal-builder-hub, cocounsel-legal) remain deferred per D-051's trigger conditions (academic/clinical user demand OR strategic-priority signal). Revisit if/when a trigger fires; otherwise proceed directly to Step 4.
- **Step 4:** Move to a new product capability entirely. The architecture is mature enough to support new directions. Operator's call which direction.

## Key files and architectural anchors

For the fresh chat to know where things live:

- `components/workspace/agent-card.tsx` — agent card component (kebab, info icon, fork affordance live here)
- `components/workspace/department-card.tsx` — department card (pencil icon for description edit; kebab swap deferred per polish #2 until a second admin action lands)
- `components/workspace/department-launchpad-content.tsx` — three-tier launchpad rendering
- `components/workspace/agent-details-panel.tsx` — slide-over read-only inspection
- `components/workspace/collapsible-section.tsx` — per-section collapsibility on the launchpad
- `components/workspace/workspace-rail.tsx` — the sidebar rail (rail collapsibility shipped per polish #1)
- `lib/auth/access.ts` — the project's primary cache-wrapped access layer
- `lib/agents/source.ts` — `parseSourceOrigin`, `getSourceDisplayLabel` for C4L attribution
- `lib/preferences/keys.ts` — user-preferences key registry; `deptCollapsedSectionsKey`, `CollapsedSectionsValue`
- `lib/preferences/types.ts` — preference value type definitions
- `lib/actions/agents.ts` — the agents server-actions module
- `lib/actions/agent-details.ts` — lazy-fetch for read-only inspection
- `lib/actions/user-preferences.ts` — preference get/set server actions
- `scripts/import-c4l-plugin.ts` — the C4L import script (operator runs manually)
- `docs/C4L_DEFERRED_SKILLS.md` — authoritative reference for every C4L skill audited, where it landed, and why
- `supabase/migrations/` — all schema changes; current HEAD is 0041
- `supabase/seed/0001_org_and_departments.sql` — canonical post-migrations state; comment header documents the four-group taxonomy

## Migration history summary

Current HEAD on main: post-0041 application by operator (last migration). All 41 migrations applied to the live Supabase database. Seed file maintained in sync via per-migration updates (most recently in commit 94ddcc0 for polish #7).

Recent migrations of note:
- 0025 — user_preferences table
- 0028 — M&A renamed to Corporate (slug + name)
- 0029 — Corporate description scope expansion
- 0031 — Employment department added
- 0033 — four-group taxonomy reorder; reserved slot 3 for Regulatory
- 0034 — Regulatory added at sort_order 3
- 0036 — reserved slots 7, 10, 11 for AI Governance, IP, Litigation
- 0037 — AI Governance, IP, Litigation added
- 0041 — department description updates (polish #7: sentence-case + cross-department overlap removal)
- 0026, 0027, 0030, 0032, 0035, 0038, 0039, 0040 — C4L filter migrations for each plugin

## Deferred work explicitly punted

Things explicitly out of scope right now but documented for the future:

- Workspace dashboard (post-launch)
- Regulatory monitors (separate product)
- Invitation gate (sunsets D-035)
- Public/private repo decision (currently private)
- Managed-agent Option B managed-agent API (post-MVP)
- Auto-fork pattern (Position C, long-term — though see polish item #12)
- Zero-access state mailto at app/workspace/page.tsx:101,107 (verify before assuming outstanding; not re-checked in polish phase)
- Sync pipeline Shape B (after manual Shape A validated — Shape A is validated now, but Shape B is post-polish)
- Tracker-UI surface (litigation matter portfolio is leading candidate; see ranked candidates section)
- Skill library surface for pattern #5 reference/framework skills
- Admin configuration surface for cold-start-interview + customize
- Admin workspace management surface for matter-workspace
- Workflows surface for router skills
- Non-department content tier (new rail group + new entity type) for academic, clinical, and external C4L content (law-student, legal-clinic plugins and similar future content). Resolved deferral from polish #9 — separate rail group with separate entity type, distinct from the Departments group. See polish #9 entry for full context.
- Analytics promotion from localStorage to Supabase per D-010. Verified during polish #13 Stage 3b2 that lib/analytics/events.ts is still localStorage-only; admin metrics page explicitly notes per-browser scope. Phase 2 commitment carried into post-polish backlog.
- Full document export (.docx, Google Docs, etc.). Per-message markdown download is wired via DownloadMessageButton; full conversation export and rich document formats remain deferred.
- Agent versioning. Point-in-time agent reconstruction beyond the per-conversation system_prompt + model snapshot. No audit_log table or agent_versions table exists today.

## How a fresh chat opens

The polish phase has closed its content-quality sweep. A fresh chat session at this point opens to a project in the post-content-polish state with three substantive items remaining (#15, #16, #17) plus the recurring discipline of #14.

The first message from the operator in the fresh chat will likely be brief. The chat should:

1. Acknowledge the handoff is loaded and that polish items #1 through #13 are closed.
2. Confirm the current state: polish #14 is a recurring discipline (no current action unless taxonomy or agent inventory shifts); polish #15 (button/card hover-effect refinement) and #16 (em-dash sweep across remaining external surfaces) are bounded iterative work; polish #17 (sequenced roadmap construction) is the genuine final polish item, gated on #15 and #16 being complete.
3. Ask the operator which remaining item to tackle next, or whether to transition directly to Step 3 / Step 4 framing.

Steps 3 and 4 after polish: per D-051, the out-of-scope C4L plugins (law-student, legal-clinic, legal-builder-hub, cocounsel-legal) remain deferred unless a trigger fires. If no trigger, Step 4 (next product capability, operator's call) is the next direction.

The fresh chat must honor the working rules from message one. One question at a time. No bundled steps. Dual-delight standard. Build for the long term.

End of handoff.
