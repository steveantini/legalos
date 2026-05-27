# Roadmap

Ordered list of work items, top to bottom. Earlier items are higher priority than later items. This roadmap is the authoritative source of "what's next" for legalOS; CHATBOT_HANDOFF.md points here rather than maintaining its own deferred-work list.

The order reflects current operator priority and is expected to shift as items ship, new items surface, and product direction evolves. Reordering this list is a normal part of regular work, it doesn't require a decision-log entry.

Items shipped from this roadmap get removed; items added get inserted at the appropriate position. The Backlog section at the bottom holds items not yet prioritized; promote to the main list when an item is worth real work.

---

## 1. Share & connector hub for per-message export and send-to destinations

Per-message Word (.docx) export ships today via the kebab destination hub on the chat message action row (D-054). The hub is designed to absorb additional destinations as items, using the "Export to" / "Send to" verb convention:

- Export to: Word (shipped), Google Docs, Excel, PDF.
- Send to: Slack, Gmail, Outlook, Apple Mail, Messages / SMS, Box.

Most destinations depend on the Connections infrastructure landing, which this item now owns: workspace-level OAuth connections to Google, Slack, Gmail/Outlook, Box, and similar; the kebab menu reads connected services and renders matching items. Phase 1 destinations that don't require a connection (PDF rendered locally, mailto: links for native email) can ship ahead of the Connections work.

Connected-drive uploads for chat attachments also live here. Phase 1 of the chat-attachments arc shipped local-desktop uploads to the chat composer (a "+" affordance, drag-and-drop, attachment chips, and an inline privacy disclosure); Phase 2 of chat attachments, uploads from connected drives like Google Drive, Box, and Dropbox, depends on the same Connections infrastructure and joins this item.

Full-conversation export (multi-message stitched into one document) is the natural second feature of this arc, likely as a kebab item at the conversation level (chat header) rather than per-message. Per D-054 it stays deferred until the hub ships its second destination.

## 2. Recents panel

A left-side panel showing recent conversations with the current agent (agent-scoped, not workspace-scoped, per the design decision during the chat page redesign session). Same shape as Claude.ai's recent-chats sidebar.

The Continue working section on the workspace home already surfaces recent conversations across all agents. The Recents panel on the agent page extends this with agent-specific history: when a user is inside an agent's chat surface, they should see their own conversation history with that agent at a glance.

Requirements: panel positioning (left of the message thread, persistent across conversation switches), the conversation-list query (filtered by agent_id, ordered by updated_at), click-to-resume behavior, the current conversation highlighted, and possibly a "New chat" button at the top.

## 3. Workspace home dashboard revamp

The personalized home shipped in Stage 2b of the Workspace home and rail restructure arc (HomeHero + Continue working + Recently used + Browse all) is functional but visually and conceptually thin per the operator's assessment. The home page deserves the treatment a real dashboard merits: content that makes users want to open the product, surfacing matters/activity/team momentum beyond just continuing recent work. Specific direction needs dedicated design thought, not incremental tweaks.

## 4. Brand mark concentric circles upgrade

The rail brand mark currently uses a 7px filled dot placeholder + "legalOS Workspace" wordmark. The concentric circles motif from the landing page (the marketing visual identity) would be a delightful brand-continuity moment between marketing and product if scaled and refined for the rail. Slot reserved; visual design needed before engineering. Governed by the brand-scarcity principle (D-053): the rail brand mark is the natural third placement for the motif, after the landing page and the chat ThinkingGlyph.

## 5. Template Library concept definition

Workflows group's "Template Library" leaf is currently a coming-soon card. The actual concept is undefined: most likely workflow templates (multi-step workflows users can adopt and customize), but could be agent templates or prompt templates. Decide concept before building. Related to item 7 (skill library surface); both involve reusable artifact libraries and could share design thought.

## 6. Tracker-UI surface

Structured matter-tracking surface: a portfolio of legal matters with status, deadlines, action items, ownership. The litigation-legal C4L plugin's matters/_log.yaml schema (flagged in polish #8 as "the single most valuable design reference across all nine plugin imports") provides a free 50-line schema spec for the matter portfolio data model. Substantial product work; legal teams universally need matter tracking. Use the litigation plugin's schema as design reference rather than reinventing.

## 7. Skill library surface (C4L pattern #5)

C4L plugins ship with reference SKILL.md files (Pattern #5 in docs/C4L_DEFERRED_SKILLS.md) that aren't exposed in product UI today. A skill library surface would let users browse and use the patterns and reference materials from C4L plugins. Related to item 5 (Template Library); both are reusable-artifact libraries and could share design thought or even a UI shell.

## 8. Auto-fork pattern

The C4L hybrid-edit pattern (admin edits to C4L agents preserve original C4L provenance while letting the admin customize) works today, but the pattern is manual and gate-based. An "auto-fork" refinement would streamline or restructure it: possibly automatic fork on first admin edit, possibly different fork semantics, possibly making the hybrid-edit pattern more transparent to admins. Scope to be defined when work starts.

## 9. Managed-agent Option B API

Architectural decision and implementation for how managed (vendor-imported) agents are stored, updated, and re-imported when vendors push new versions. C4L plugins are the current concrete instance; the pattern generalizes to any vendor-shipped agent. Option B (specifics in C4L design history) is the chosen direction; implementation deferred. Infrastructure work, not directly user-visible but foundational for scaling C4L beyond the current 9 plugins.

## 10. Polish #16: em-dash sweep across remaining marketing pages

Six marketing pages were not touched in commit 88e296d's marketing copy delight pass: about, blog, contact, documentation, faq, legal. They still contain em-dashes per the no-em-dashes-in-external-copy convention established in polish #15 stage 3-interlude. Mechanical pass: read each file, replace em-dashes with commas or periods, preserve sentence rhythm. Could be one focused commit.

## 11. Out-of-scope C4L plugins (per D-051)

Four C4L plugins (law-student, legal-clinic, legal-builder-hub, cocounsel-legal) remain deferred per D-051's trigger conditions: academic/clinical user demand OR strategic-priority signal. These don't fit the current department taxonomy and would require new infrastructure (a new rail group, a new entity type). Revisit if/when a trigger fires; otherwise stays in position pending real user demand.

## 12. Admin section full revamp

Three sub-areas surface here, each substantial enough to be its own multi-stage effort:

- Admin analytics: comprehensive admin dashboards, metrics, reporting (relates to roadmap item 19; analytics promotion to Supabase is a prerequisite).
- Evaluations / testing: some form of agent evaluation, A-B testing, or quality measurement surface for admins to assess agent performance.
- Scalable department configuration: admin tooling to manage departments at scale (faster than the per-row admin UI, possibly bulk operations, possibly a different data model for department configuration).

Likely absorbs the admin-config-surface and matter-workspace-management backlog items when this work starts. Treat as its own multi-stage arc when ready. Scope conversation needed before any engineering starts.

## 13. Signup flow that captures display name

The current signup flow doesn't capture a user's full_name; the column stays null in public.users. Discovered when the personalized home hero showed "Welcome back." with no name for the operator's own account. Every new user signing up today has the same problem. Fix: modify signup to collect a name (at signup time or as a required first-login step), store in public.users.full_name. Real production gap for any multi-user deployment.

## 14. Privacy and security

Broad initiative covering multiple sub-areas. Specific scope to be determined when work starts. Likely candidates: RLS audit (ensure all tables have correct policies and that policies match intent), security review of auth flows, data retention policies, user privacy controls (export/delete account, consent management), GDPR/CCPA readiness if targeting those jurisdictions, SOC 2 prep if planning to sell to enterprise. Some of these are quick audits; some are major undertakings.

## 15. Privacy and security FAQ content for chat attachments and AI data handling

The chat-attachments arc surfaced privacy and security questions that deserve dedicated treatment on the FAQ landing page: where files live (the customer's Supabase workspace), what happens to content during chat (Anthropic's standard no-training contract, the default abuse-monitoring retention window, zero-data-retention availability for enterprise customers if pursued), how prompt caching works in practice, attachment delete-after-send mechanics, and the policy on agent-attached references versus message-attached files.

The inline privacy disclosure on first attach (shipped in the chat-attachments arc) is the lightweight in-product touchpoint; the FAQ entries are the deeper treatment. Scope: 4 to 6 Q&A entries on the existing FAQ page (which is in scope for item 10's em-dash sweep, but content additions are a separate workstream). Phrasing should be plain-language, not legal: the privacy policy is the binding document, the FAQ is the explainer.

## 16. Full code review / bug sweep / maintenance polish

Comprehensive product audit from a maintainer-delight standpoint. Likely candidates: TypeScript strictness audit (any/unknown usage), dead code removal, unused dependency cleanup, test coverage analysis (write missing tests for critical paths), linting consistency, accessibility audit (WCAG compliance), performance audit (lighthouse scores, bundle size, query performance), error handling review (especially around the chat route and Supabase queries). Could be broken into focused passes, one commit per area.

## 17. Claude Skills analysis

Extract lessons learned from this project for the Claude Skills template repo. Concrete intent: identify patterns or capabilities developed during legalOS that could become reusable Claude Skills for future projects. Requires actual analysis to identify candidates; could be 1 skill or 5. Examples of what might surface: the dual-delight standard as a skill, polish-list discipline as a skill, specific UX patterns (asymmetric motion tokens, three-tier active state, coming-soon vs locked treatment), Supabase + Next.js App Router patterns, or session-handoff patterns. Output: skill candidates with rough scope, ready to be migrated to the Claude Skills template repo.

## 18. Auth layer optimization

The workspace layout makes 3 sequential supabase.auth.getUser() network calls per render plus several table reads, all on the critical path of every navigation. The Stage 4 follow-up loading.tsx fix addressed perceived latency by giving navigation instant skeleton feedback, but the actual server wall-clock is unchanged. Concrete fix: collapse the 3 getUser() calls to 1 (a single cache-wrapped helper that all three sites use), and derive isAdmin from the already-fetched profile rather than a separate fetch + users query. Real wall-clock reduction on every workspace navigation.

## 19. Analytics promotion from localStorage to Supabase (per D-010)

The current analytics_events writer (lib/analytics/events.ts) is localStorage-only per D-010's Phase 2 deferral. Promotion to Supabase: create an analytics_events table, migrate the writer to make server-side inserts, update admin metrics views to read from the new table. Real benefit: per-user analytics, cross-device, server-side aggregation, admin metrics quality improvement. Prerequisite for richer admin analytics in item 12 (admin section revamp).

## 20. Zero-access state mailto verification

Per the Workspace arc's Stage 3h handoff cleanup, the zero-access state mailto reference at app/workspace/page.tsx (originally noted around lines 101, 107 before the Stage 2b restructure) was kept with a "verify before assuming outstanding" annotation. Quick verification task: confirm the mailto is wired correctly post-Stage-2b, that siteConfig.adminEmail resolves correctly, and that the no-access branch of HomeHero renders the expected request-access affordance. Could be ten minutes of inspection or a small fix if something's off.

## 21. Agent versioning (audit trail)

Tracking who created / edited / deleted / forked which agent and when. No audit_log table or version history table exists today. Scope is unclear and depends on the use case: full audit log (every change with diff), version history (rollback to previous), or just provenance (who created this, when). Each has different complexity. Decide scope when the use case becomes concrete, likely surfacing during item 12 (admin section revamp) when admins ask "who changed this agent?"

---

## Backlog (unprioritized)

Items recorded for future consideration that haven't been actively prioritized into the main list above. Some were previously tracked in CHATBOT_HANDOFF.md's deferred-work section; some are product directions not yet evaluated. Promote to the main list when an item is worth real work.

### Sync pipeline Shape B

Architectural direction for the C4L sync pipeline. Shape B was a previously-evaluated approach for how C4L plugins get periodically re-synced from vendor sources (specifics in C4L design history). Backlogged because the current import pipeline (run scripts/import-c4l-plugin.ts manually) works for the operator's current scale; productizing the sync flow is real engineering not yet justified by demand.

### Regulatory monitors

Some form of regulatory change tracking: alerting users when laws or regulations relevant to their practice areas change. A product direction surfaced during earlier exploration; not yet evaluated for scope or fit.

### Invitation gate

User invitation flow: admins inviting new users to legalOS. The current state has no invitation flow; users have to be manually added via Supabase. Real production gap for any multi-user deployment beyond the operator's single account. Related to item 13 (signup flow) in that both address gaps in the multi-user onboarding path.

### Public/private repo decision

Strategic decision about whether the legalOS codebase stays private (current state) or becomes public/open-source. Has implications for licensing, contribution model, IP strategy, marketing positioning. Backlogged pending operator readiness to engage with the decision.

### Rail auto-expand toggle preference

The current force-expand logic (from polish #1, extended in Stage 4 of the workspace arc) automatically expands a rail group when its leaf or group landing is the active route, unless the user has explicitly toggled the group's collapse state this session. The operator expressed a preference for "full control by user" (no auto-expand) but chose to live with the current behavior. If the preference firms up, the fix is to remove the forceExpanded computation from CollapsibleRailGroup and rely solely on user toggle + persisted preference.

### Rail caption hover-bar width tune

After Stage 4 of the workspace arc moved the chevron to the right of the caption, the caption's `flex-1` means its hover bg-fill now spans the full row width up to the chevron. It may read as too wide depending on visual evaluation; if so, narrowing the caption's bg-fill is a small tune. The operator hasn't flagged it as an issue; documented in case future evaluation surfaces it.

### Admin config surface

Substructure of the admin section revamp (item 12). Specific admin UI for configuring application-wide settings. Likely absorbed when item 12 is scoped.

### Matter-workspace management

Substructure that overlaps with the Tracker-UI surface (item 6) and the admin section revamp (item 12). Specific UI for managing the relationship between legal matters and workspace state. Likely clarifies as items 6 and 12 are scoped.

### Router-skills Workflows surface

Substructure of the Workflows group's eventual product surface. The router-skills pattern (Pattern #1 in docs/C4L_DEFERRED_SKILLS.md) is the C4L approach for multi-skill agents routing between sub-skills. A Workflows UI surface would expose this pattern. Likely clarifies when item 5 (Template Library concept) is defined.
