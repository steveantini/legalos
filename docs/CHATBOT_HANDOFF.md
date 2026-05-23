# legalOS — Chat Session Handoff

This file is the bootstrap document a fresh chat session reads to come up to speed on legalOS. Read it in full before doing any work.

## What legalOS is

legalOS is an AI-native operating system for in-house legal departments. Next.js 16 (App Router) + Supabase (Postgres with RLS) + Anthropic API. Production-shape architecture, pre-launch product.

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
- Cache-wrapped helpers in `lib/auth/access.ts` (the 820-line access layer).
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

## What's in flight — POLISH PHASE STARTS HERE

The fresh chat session opens at the start of the polish phase. The plan is to work through the polish list in order of user impact, with rail collapsibility first.

### Polish list (13 items, in priority/sequence order)

1. **Rail group collapsibility** — Knowledge / Workflows / Integrations / Help / possibly Departments. Increasingly important with 13 departments in the rail. THIS IS THE NEXT ITEM TO WORK ON. Start here.

2. **Card affordance consistency between department and agent cards.** Resolved in commit [sha pending] via Option (a): the pencil-icon visibility on department cards was brought into parity with the agent-card kebab visibility model (`opacity-40` at rest, brighten on hover, brighten on focus-within, shared bare `transition-opacity`). Trigger-shape symmetry (pencil vs. kebab) was deliberately NOT pursued because the department card has exactly one admin action today (Edit description), making a kebab-with-one-item a UX regression vs. the direct pencil affordance (2 clicks vs. 1).

   Future revisit: when a second department admin action lands (e.g., rename department, archive department, manage department agents from the card), the kebab swap becomes the right call — at 2+ actions the kebab earns its weight. Add the second action as part of that future scope; the kebab refactor follows.

3. **Delete-dialog copy mentioning "forked copies are unaffected"** — irrelevant for C4L agents. Tighten the copy or branch by source type.

4. **Composer model picker rejecting C4L agents** — asymmetry with the edit form. Investigate and decide.

5. **Sort_order normalization after C4L filtering — DROPPED as no-op.** Resolved by investigation in this session: sort_order is never rendered in the UI (it's purely an ORDER BY column in `getAgentsForDepartmentLaunchpad`), so the gaps left by soft-deleted C4L rows are invisible to users. Any normalization migration would also be undone by the next C4L re-import — the import script (`scripts/import-c4l-plugin.ts`) reassigns sort_order from `100 + index` on every upsert. Modifying the import script to preserve normalized sort_orders would introduce real branching complexity to a currently-clean idempotent script, for zero observable benefit. If a future feature ever surfaces sort_order visually (drag-handle position pickers, sortable lists, tracker-UI position indicators, etc.), that feature handles normalization in its own scope.

6. **Reorder docs/C4L_DEFERRED_SKILLS.md sections** — cosmetic only. Currently agents/ note comes before Pattern note; could cluster all pattern observations together.

7. **Department description copy consistency** for Commercial, Public Sector, Operations, General Tools. Current state:
   - Commercial: "Revenue (sell-side) agreements, procurement (buy-side) agreements, Non-Disclosure Agreements, Artificial Intelligence Addenda." (long, formal capitalization breaks the sentence-case voice)
   - Public Sector: "Government relations, regulatory affairs, public-sector contracts, and policy advocacy." (regulatory affairs now overlaps Regulatory)
   - Operations: "Internal operations, vendor management, procurement, and corporate transactions." (corporate transactions now overlaps Corporate)
   - General Tools: "general purpose agentic tools" (only one capitalized; "agentic" reads as internal jargon)
   
   Goal: consistent voice, length, sentence case, no overlap with adjacent departments.

8. **Data/ directory note** — concept review when we hit it. Operator wants an explanation of what `data/` directories in C4L plugins are for and how they relate to legalOS architecture.

9. **Out-of-scope C4L plugins decision** — law-student (13 skills, academic), legal-clinic (16 skills, clinical), legal-builder-hub (10 skills, meta/registry), external_plugins/cocounsel-legal (Thomson Reuters partner). Substantive content but doesn't fit the department-agent UX. Decide whether they slot into Knowledge tier, Marketplace, an admin surface, or get their own product surface entirely.

10. **Workspace hero refinement:**
    - Title size: reduce slightly. Current size feels too large with time. Specific amount TBD at the polish moment (iterative, not single-shot).
    - Subline copy: current "Your team's agents, knowledge, matters, and resources, all in one place." Up for review to better reflect the actual four product domains in the rail (Knowledge / Workflows / Integrations / Help). Proposed: "Your team's agents, knowledge, workflows, and integrations, all in one place." — though worth re-thinking whether "agents" belongs alongside the four domains (agents live within departments rather than as a top-level domain) or whether to replace "agents" with one of the domains.

11. **Reserved slot** — for the next thing the operator notices during polish.

12. **C4L agent fork behavior — verify and decide.** Canonical agents have a fork affordance (user copies template into personal "my agent"). Unclear whether the fork affordance works on C4L agents today, is hidden, or rejects at the server. Need to:
    - Investigate current behavior (read-only)
    - Decide whether C4L agents should be forkable (likely yes — fork creates new row, doesn't modify upstream content)
    - Implement fix if needed (likely small — UI affordance gating + possibly a clarifying "Forked from Claude for Legal" badge so users understand lineage)

13. **Documentation and external-facing copy refresh** (final item, by design):
    - `README.md` — currently reflects an earlier product state
    - Marketing landing pages under `app/(marketing)/`
    - `docs/` directory contents
    - `docs/CHATBOT_HANDOFF.md` itself (refresh after polish phase completes)
    - Any external-facing copy
    
    Goal: someone landing on the project gets an accurate, well-digested picture of what legalOS is right now. Internal docs and external copy should both be truthful, current, and crafted with the same care as the product itself.

### Sequencing decision locked

Work the polish list in approximately the order listed (Option B from the prior discussion: highest user impact first). Rail collapsibility (#1) is the start. Doc refresh (#13) is the end by definition.

That said: the operator may surface new items during polish (slot #11 is held for exactly that). The order is a default, not a contract.

### Steps 3 and 4 (after polish)

After the polish list is complete:

- **Step 3:** Tackle the out-of-scope C4L plugins (item #9 elevates from polish to a real product decision). Decide where they live and implement.
- **Step 4:** Move to a new product capability entirely. The architecture is mature enough to support new directions. Operator's call which direction.

## Key files and architectural anchors

For the fresh chat to know where things live:

- `components/workspace/agent-card.tsx` — agent card component (kebab, info icon, fork affordance live here)
- `components/workspace/department-card.tsx` — department card (pencil icon currently; will become kebab per polish #2)
- `components/workspace/department-launchpad-content.tsx` — three-tier launchpad rendering
- `components/workspace/agent-details-panel.tsx` — slide-over read-only inspection
- `components/workspace/collapsible-section.tsx` — per-section collapsibility on the launchpad
- `components/workspace/workspace-rail.tsx` — the sidebar rail (target of polish #1)
- `lib/auth/access.ts` — 820-line cache-wrapped access layer
- `lib/agents/source.ts` — `parseSourceOrigin`, `getSourceDisplayLabel` for C4L attribution
- `lib/preferences/keys.ts` — user-preferences key registry; `deptCollapsedSectionsKey`, `CollapsedSectionsValue`
- `lib/preferences/types.ts` — preference value type definitions
- `lib/actions/agents.ts` — 1004-line agent server actions
- `lib/actions/agent-details.ts` — lazy-fetch for read-only inspection
- `lib/actions/user-preferences.ts` — preference get/set server actions
- `scripts/import-c4l-plugin.ts` — 315-line C4L import script (operator runs manually)
- `docs/C4L_DEFERRED_SKILLS.md` — authoritative reference for every C4L skill audited, where it landed, and why
- `supabase/migrations/` — all schema changes; current head is 0040
- `supabase/seed/0001_org_and_departments.sql` — canonical post-migrations state; comment header documents the four-group taxonomy

## Migration history summary

Current HEAD on main: post-0040 application by operator (last migration). All 40 migrations applied to the live Supabase database. Seed file in sync with the live DB after the comprehensive sync in commit 05d7ee2.

Recent migrations of note:
- 0025 — user_preferences table
- 0028 — M&A renamed to Corporate (slug + name)
- 0029 — Corporate description scope expansion
- 0031 — Employment department added
- 0033 — four-group taxonomy reorder; reserved slot 3 for Regulatory
- 0034 — Regulatory added at sort_order 3
- 0036 — reserved slots 7, 10, 11 for AI Governance, IP, Litigation
- 0037 — AI Governance, IP, Litigation added
- 0026, 0027, 0030, 0032, 0035, 0038, 0039, 0040 — C4L filter migrations for each plugin

## Deferred work explicitly punted

Things explicitly out of scope right now but documented for the future:

- Workspace dashboard (post-launch)
- Regulatory monitors (separate product)
- Invitation gate (sunsets D-035)
- ?next= preservation in proxy.ts:24 (verify before assuming outstanding)
- Public/private repo decision (currently private)
- Managed-agent Option B managed-agent API (post-MVP)
- Auto-fork pattern (Position C, long-term — though see polish item #12)
- Zero-access state mailto at app/workspace/page.tsx:101,107
- Sync pipeline Shape B (after manual Shape A validated — Shape A is validated now, but Shape B is post-polish)
- Tracker-UI surface (litigation matter portfolio is leading candidate; see ranked candidates section)
- Skill library surface for pattern #5 reference/framework skills
- Admin configuration surface for cold-start-interview + customize
- Admin workspace management surface for matter-workspace
- Workflows surface for router skills

## How a fresh chat opens

The first message from the operator in the fresh chat will be brief — likely "ready to continue with polish phase" or similar. The fresh chat should:

1. Acknowledge the handoff has been received and the context is loaded.
2. Confirm the immediate next step: polish list item #1, rail group collapsibility.
3. Before writing any patches, do a brief read-only investigation of the current rail implementation (`components/workspace/workspace-rail.tsx` and `lib/workspace/rail-styles.ts`) so the patch is grounded in actual code rather than assumed structure.
4. Then propose the design and implementation approach for rail collapsibility, with one focused question for the operator to confirm before writing the patch prompt.

The fresh chat must honor the working rules from message one. One question at a time. No bundled steps. Dual-delight standard. Build for the long term.

End of handoff.
