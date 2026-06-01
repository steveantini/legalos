# Roadmap

Ordered list of work items, top to bottom. Earlier items are higher priority than later items. This roadmap is the authoritative source of "what's next" for legalOS; CHATBOT_HANDOFF.md points here rather than maintaining its own deferred-work list.

The order reflects current operator priority and is expected to shift as items ship, new items surface, and product direction evolves. Reordering this list is a normal part of regular work, it doesn't require a decision-log entry.

Items shipped from this roadmap get removed; items added get inserted at the appropriate position. The Backlog section at the bottom holds items not yet prioritized; promote to the main list when an item is worth real work.

---

## 1. Admin polish arc (admin information architecture, designed fresh)

The connector hub arc shipped (Settings as a peer mode, the capability-grouped Connections page, the connections/grants/policy data model with RLS, Google Drive OAuth end to end, policy enforcement, live Drive reads in agents, and the Drive file picker with search and folder browsing; D-062 through D-072). The deferred Admin work is now the next major arc, and it is deliberately architecture-first.

The admin information architecture is undecided and gets designed fresh: all admin functions, roles, and surfaces thought through up front before more admin-dependent features accrete on top. The existing admin pages (Productivity Calculator, Adoption Metrics, User Access) are placeholder-quality and get brought up to the polish standard in this arc.

The admin connection-policy editing UI lives here (deferred from the connector arc per D-066): policy enforcement shipped, but the super-admin UI to edit the policy (allowed categories, allowed providers, the capability ceiling) is built in this arc, where the admin IA is designed fresh. Until then the `connection_policy` row is edited directly in the database.

Three sub-areas surface within this arc, each substantial enough to be its own multi-stage effort:

- Admin analytics: comprehensive admin dashboards, metrics, reporting (relates to roadmap item 17; analytics promotion to Supabase is a prerequisite).
- Evaluations / testing: some form of agent evaluation, A-B testing, or quality measurement surface for admins to assess agent performance.
- Scalable department configuration: admin tooling to manage departments at scale (faster than the per-row admin UI, possibly bulk operations, possibly a different data model for department configuration).

Admin adopts the settings primitives (the portability principle): the refined-list landing, the considered register, the left-justified layout, flat-at-rest rows with hover-highlight, grounding state-dots, and the network-backed-UI loading standard (skeleton-on-open plus cross-fade). Likely absorbs the admin-config-surface and matter-workspace-management backlog items when this work starts.

The IA is now decided (D-074): admin's two jobs, govern the use and measure the value, with four areas, People and Policy & access under govern, Insights and Evals under measure.

**A1 (shell) shipped (2026-05-31):** the admin rail (lead-line "Admin" + the govern/measure captioned groups), the refined landing introducing each area, and four coming-soon area stubs, with admin reconciled to the 896px settings-family width.

**A2 (Policy & access editor) shipped (2026-05-31):** the super-admin UI to edit the org's connection policy (the capability ceiling as a read-only / read-and-write trust statement, and allowed connection categories with providers derived server-side), gated to super admins via a net-new `isCurrentUserSuperAdmin()`; other admins see it read only. Closes D-066 (the deferred connection-policy editing UI); the policy no longer needs direct-DB edits. See D-076.

**A2b (org default model) shipped (2026-06-01):** the third Policy & access governance control, the org-level default model new agents start with, stored super-admin-only on the organizations row (read-only for other admins). The product's scattered model lists were consolidated into one canonical models source feeding validation and every picker, and Claude Opus 4.8 was added as the new flagship and default (joining the composer quick-pick alongside Sonnet 4.6 and Haiku 4.5; older Opus versions stay in the full form picker). Policy & access is now complete: capability ceiling, allowed categories, and default model. See D-078.

**A3a (People roster + roles) shipped (2026-06-01):** the People area replaces the old users page's roster, department-access, and new-user default-departments with an A2/A2b-register surface, and adds an in-product org-role editor governed by a least-privilege escalation rule (only a super admin grants super admin; an org admin manages user↔org-admin only; the last super admin cannot be demoted; self-demotion confirms). The rule is enforced in three layers (honest UI, server action, and a tightened RLS/trigger that closes the prior privilege-escalation hole). Every role change is recorded to a new `role_change_audit` table, which feeds the future A6 audit-log UI. See D-079. The old users page stays reachable but unlinked, retiring once People fully supersedes it (after A3c).

**A3b (soft-deactivation) shipped (2026-06-01):** `users.is_active` is now load-bearing. Admins deactivate/reactivate a person from the roster; deactivation is a reversible soft block (flips one flag, destroys nothing) enforced at the request layer (proxy per-request cutoff, auth-callback new-session reject, workspace-layout page guard), deliberately not via RLS. Gating mirrors A3a (org_admin can't deactivate a super_admin; the last active super_admin can't be deactivated; self-deactivation confirms), and the A3a role trigger's last-super-admin count was tightened to require active status. Every status change records to a new `user_status_audit` table. See D-080.

**A3c (invitation) shipped (2026-06-01) — PEOPLE COMPLETE.** Admins invite by email with a chosen role + departments; the invite rides Supabase's auth email via the service-role `inviteUserByEmail` (no new email infrastructure), and acceptance is seamless (provisioning consumes the pending invite on first sign-in, applying the chosen role/departments). The env-var allowlist is replaced by a DB-backed gate (admit invited OR existing user, env list kept only as a safety hatch, never fail-closed-on-unset, so the owner is never locked out). Pending invites are resent/revoked on People, same escalation gating. **The old admin Users page is retired** (308 redirect to People; its duplicated components removed). People now covers roster, roles, deactivation, defaults, and invitation. See D-081.

The next admin area is the MEASURE side: **A4 Insights** (absorbing today's Adoption Metrics and Productivity Calculator), **A5 Evals**, **A6** the audit-log viewer (over `role_change_audit` and `user_status_audit`, plus later audit streams including invitation lifecycle events); data/retention folds into People/Policy; then a docs close-out. Deferred ops/polish, not blocking: a branded custom invite-email sender (Resend + `generateLink`) and a Supabase SMTP configuration for invite volume. The remaining legacy admin pages (Productivity Calculator, Adoption Metrics) stay reachable at their routes but unlinked from the new rail, retiring as A4/A5 replace them.

## 2. Connector follow-ups (deferred from the connector hub arc)

Tracked so they are not lost; each builds on the connector infrastructure shipped in the connector hub arc.

- Agent-form Drive picker: the Drive picker shipped in the chat composer (message attachments) only. Adding it to the agent form (agent attachments) reuses the same picker component. Dependency to clear first: the agent EDIT page must render `gdrive_link` agent attachments gracefully in its attachment display. Today's rendering predates Drive attachments, and a `gdrive_link` agent attachment is only creatable by hand-insert; once the agent-form picker exists, real ones will appear and the edit page must display them without error.
- Admin connection-policy editing UI: the super-admin surface to edit the connection policy, built in the Admin polish arc (item 1) where the admin IA is designed. Until then the `connection_policy` row is edited directly in the database.
- Calendar and Gmail connectors: each is a new provider adapter reusing the existing OAuth flow, the single provider-agnostic callback, the token-exercise layer, and (for a picker) the listing layer. The home's Today (calendar) and Matters connected-state views are dormant behind `isCalendarConnected` / `isMattersConnected`, ready to light up when those connectors ship. The Calendar, Gmail, and Slack Connect CTAs on the Connections page are inert today (no adapter yet). A compact connection-status strip on the home (D-061) is a possible later addition once multiple connectors exist.
- Drive picker refinements: pagination and scoped-in-folder search (the picker uses single capped pages plus global search today); additive enhancements if needed.
- Models as a connection: available models derive from connected model providers, and the org default then becomes selectable from any connected model. The canonical models source (lib/llm/models.ts, shipped in A2b) is the single seam to swap when this lands; validation and every picker follow without change.
- Connection mechanism: API vs CLI vs MCP, to decide in the Connections phase (which transport a connected model provider uses).
- Model lineup refresh: check for newer Sonnet/Haiku versions and handle deprecations. With the canonical models source this is a one-place edit; A2b deliberately added only Opus 4.8 and left Sonnet 4.6 / Haiku 4.5 untouched.

The remaining Share destinations from the original connector item stay tracked here: per-message Export to (Google Docs, Excel, PDF) and Send to (Slack, Gmail, Outlook, Apple Mail, Messages / SMS, Box) via the kebab destination hub (D-054), and full-conversation export as a conversation-level kebab item (deferred per D-054 until the hub ships its second destination). Most destinations depend on the connector infrastructure now shipped; PDF (rendered locally) and mailto: links can ship without a connection.

## 3. Skill library surface (C4L pattern #5)

C4L plugins ship with reference SKILL.md files (Pattern #5 in docs/C4L_DEFERRED_SKILLS.md) that aren't exposed in product UI today. A skill library surface would let users browse and use the patterns and reference materials from C4L plugins. Related to item 11 (Template Library); both are reusable-artifact libraries and could share design thought or even a UI shell.

## 4. Out-of-scope C4L plugins (per D-051)

Four C4L plugins (law-student, legal-clinic, legal-builder-hub, cocounsel-legal) remain deferred per D-051's trigger conditions: academic/clinical user demand OR strategic-priority signal. These don't fit the current department taxonomy and would require new infrastructure (a new rail group, a new entity type). Revisit if/when a trigger fires; otherwise stays in position pending real user demand.

## 5. Privacy and security

Broad initiative covering multiple sub-areas. Specific scope to be determined when work starts. Likely candidates: RLS audit (ensure all tables have correct policies and that policies match intent), security review of auth flows, data retention policies, user privacy controls (export/delete account, consent management), GDPR/CCPA readiness if targeting those jurisdictions, SOC 2 prep if planning to sell to enterprise. Some of these are quick audits; some are major undertakings.

## 6. Full code review / bug sweep / maintenance polish

Comprehensive product audit from a maintainer-delight standpoint. Likely candidates: TypeScript strictness audit (any/unknown usage), dead code removal, unused dependency cleanup, test coverage analysis (write missing tests for critical paths), linting consistency, accessibility audit (WCAG compliance), performance audit (lighthouse scores, bundle size, query performance), error handling review (especially around the chat route and Supabase queries). Could be broken into focused passes, one commit per area.

## 7. Build out Knowledge, Workflows, and Integrations

The three rail groups currently route to coming-soon placeholders for most leaves: Knowledge (Research, Vault, Sources), Workflows (My Workflows, Template Library), and Integrations (Connections, Marketplace). Each leaf is its own product surface and at least one is a multi-stage arc in its own right. The full build-out is likely multiple separate arcs, sequenced by which leaves earn priority first.

Template Library overlaps with item 11 (Template Library concept definition), which calls out the same surface; the two items merge when this work starts. Connections under Integrations overlaps with the now-shipped connector hub — the workspace-level OAuth infrastructure it built powers the Connections surface here. Sources under Knowledge may overlap with the citation work from the Word export arc.

Scope conversation needed before any engineering starts. The work is large enough that picking one leaf to ship first (rather than building all seven sub-surfaces in parallel) is the right discipline.

## 8. Auto-fork pattern

The C4L hybrid-edit pattern (admin edits to C4L agents preserve original C4L provenance while letting the admin customize) works today, but the pattern is manual and gate-based. An "auto-fork" refinement would streamline or restructure it: possibly automatic fork on first admin edit, possibly different fork semantics, possibly making the hybrid-edit pattern more transparent to admins. Scope to be defined when work starts.

## 9. Recents panel

A left-side panel showing recent conversations with the current agent (agent-scoped, not workspace-scoped, per the design decision during the chat page redesign session). Same shape as Claude.ai's recent-chats sidebar.

The Recent section that previously surfaced cross-agent recent conversations on the workspace home was removed in the workspace home revamp arc; its component (ContinueWorkingSection) is retained unmounted to feed exactly this panel. The Recents panel on the agent page is agent-specific: when a user is inside an agent's chat surface, they should see their own conversation history with that agent at a glance.

Requirements: panel positioning (left of the message thread, persistent across conversation switches), the conversation-list query (filtered by agent_id, ordered by updated_at), click-to-resume behavior, the current conversation highlighted, and possibly a "New chat" button at the top.

## 10. Brand mark concentric circles upgrade

The rail brand mark currently uses a 7px filled dot placeholder + "legalOS Workspace" wordmark. The concentric circles motif from the landing page (the marketing visual identity) would be a delightful brand-continuity moment between marketing and product if scaled and refined for the rail. Slot reserved; visual design needed before engineering. Governed by the brand-scarcity principle (D-053): the rail brand mark is the natural third placement for the motif, after the landing page and the chat ThinkingGlyph.

## 11. Template Library concept definition

Workflows group's "Template Library" leaf is currently a coming-soon card. The actual concept is undefined: most likely workflow templates (multi-step workflows users can adopt and customize), but could be agent templates or prompt templates. Decide concept before building. Related to item 3 (skill library surface); both involve reusable artifact libraries and could share design thought.

## 12. Tracker-UI surface

Structured matter-tracking surface: a portfolio of legal matters with status, deadlines, action items, ownership. The litigation-legal C4L plugin's matters/_log.yaml schema (flagged in polish #8 as "the single most valuable design reference across all nine plugin imports") provides a free 50-line schema spec for the matter portfolio data model. Substantial product work; legal teams universally need matter tracking. Use the litigation plugin's schema as design reference rather than reinventing.

## 13. Managed-agent Option B API

Architectural decision and implementation for how managed (vendor-imported) agents are stored, updated, and re-imported when vendors push new versions. C4L plugins are the current concrete instance; the pattern generalizes to any vendor-shipped agent. Option B (specifics in C4L design history) is the chosen direction; implementation deferred. Infrastructure work, not directly user-visible but foundational for scaling C4L beyond the current 9 plugins.

## 14. Signup flow that captures display name

The current signup flow doesn't capture a user's full_name; the column stays null in public.users. Discovered when the personalized home hero showed "Welcome back." with no name for the operator's own account. Every new user signing up today has the same problem. Fix: modify signup to collect a name (at signup time or as a required first-login step), store in public.users.full_name. Real production gap for any multi-user deployment.

## 15. Claude Skills analysis

Extract lessons learned from this project for the Claude Skills template repo. Concrete intent: identify patterns or capabilities developed during legalOS that could become reusable Claude Skills for future projects. Requires actual analysis to identify candidates; could be 1 skill or 5. Examples of what might surface: the dual-delight standard as a skill, polish-list discipline as a skill, specific UX patterns (asymmetric motion tokens, three-tier active state, coming-soon vs locked treatment), Supabase + Next.js App Router patterns, or session-handoff patterns. Output: skill candidates with rough scope, ready to be migrated to the Claude Skills template repo.

## 16. Auth layer optimization

The workspace layout makes 3 sequential supabase.auth.getUser() network calls per render plus several table reads, all on the critical path of every navigation. The Stage 4 follow-up loading.tsx fix addressed perceived latency by giving navigation instant skeleton feedback, but the actual server wall-clock is unchanged. Concrete fix: collapse the 3 getUser() calls to 1 (a single cache-wrapped helper that all three sites use), and derive isAdmin from the already-fetched profile rather than a separate fetch + users query. Real wall-clock reduction on every workspace navigation.

## 17. Analytics promotion from localStorage to Supabase (per D-010)

The current analytics_events writer (lib/analytics/events.ts) is localStorage-only per D-010's Phase 2 deferral. Promotion to Supabase: create an analytics_events table, migrate the writer to make server-side inserts, update admin metrics views to read from the new table. Real benefit: per-user analytics, cross-device, server-side aggregation, admin metrics quality improvement. Prerequisite for richer admin analytics in item 2 (admin section revamp).

## 18. Agent versioning (audit trail)

Tracking who created / edited / deleted / forked which agent and when. No audit_log table or version history table exists today. Scope is unclear and depends on the use case: full audit log (every change with diff), version history (rollback to previous), or just provenance (who created this, when). Each has different complexity. Decide scope when the use case becomes concrete, likely surfacing during item 2 (admin section revamp) when admins ask "who changed this agent?"

## 19. Rename the /workspace URL namespace to /home

Deferred and low priority. The product calls the home "Home" (the breadcrumb's first segment was renamed from "workspace" to "home" via the HOME_SEGMENT constant during the workspace home arc), but the URL namespace is still /workspace. Renaming it to /home would mean a directory rename of app/workspace (about 21 route directories), updating every internal link, redirect, and proxy reference, and adding a legacy redirect from /workspace/* to /home/* so existing links and bookmarks do not break.

This is cosmetic only for a gated app: the URL-label mismatch is not an inconsistency, because URLs are infrastructure and labels are product language, and the two are allowed to differ. Captured here with the reasoning so it is not re-litigated; it sits at the bottom of the main list as low-priority polish.

---

## Backlog (unprioritized)

Items recorded for future consideration that haven't been actively prioritized into the main list above. Some were previously tracked in CHATBOT_HANDOFF.md's deferred-work section; some are product directions not yet evaluated. Promote to the main list when an item is worth real work.

### Sync pipeline Shape B

Architectural direction for the C4L sync pipeline. Shape B was a previously-evaluated approach for how C4L plugins get periodically re-synced from vendor sources (specifics in C4L design history). Backlogged because the current import pipeline (run scripts/import-c4l-plugin.ts manually) works for the operator's current scale; productizing the sync flow is real engineering not yet justified by demand.

### Regulatory monitors

Some form of regulatory change tracking: alerting users when laws or regulations relevant to their practice areas change. A product direction surfaced during earlier exploration; not yet evaluated for scope or fit.

### Invitation gate

User invitation flow: admins inviting new users to legalOS. The current state has no invitation flow; users have to be manually added via Supabase. Real production gap for any multi-user deployment beyond the operator's single account. Related to item 15 (signup flow) in that both address gaps in the multi-user onboarding path.

### Public/private repo decision

Strategic decision about whether the legalOS codebase stays private (current state) or becomes public/open-source. Has implications for licensing, contribution model, IP strategy, marketing positioning. Backlogged pending operator readiness to engage with the decision.

### Rail auto-expand toggle preference

The current force-expand logic (from polish #1, extended in Stage 4 of the workspace arc) automatically expands a rail group when its leaf or group landing is the active route, unless the user has explicitly toggled the group's collapse state this session. The operator expressed a preference for "full control by user" (no auto-expand) but chose to live with the current behavior. If the preference firms up, the fix is to remove the forceExpanded computation from CollapsibleRailGroup and rely solely on user toggle + persisted preference.

### Rail caption hover-bar width tune

After Stage 4 of the workspace arc moved the chevron to the right of the caption, the caption's `flex-1` means its hover bg-fill now spans the full row width up to the chevron. It may read as too wide depending on visual evaluation; if so, narrowing the caption's bg-fill is a small tune. The operator hasn't flagged it as an issue; documented in case future evaluation surfaces it.

### Admin config surface

Substructure of the admin section revamp (item 3). Specific admin UI for configuring application-wide settings. Likely absorbed when item 3 is scoped.

### Matter-workspace management

Substructure that overlaps with the Tracker-UI surface (item 13) and the admin section revamp (item 3). Specific UI for managing the relationship between legal matters and workspace state. Likely clarifies as items 13 and 3 are scoped.

### Router-skills Workflows surface

Substructure of the Workflows group's eventual product surface. The router-skills pattern (Pattern #1 in docs/C4L_DEFERRED_SKILLS.md) is the C4L approach for multi-skill agents routing between sub-skills. A Workflows UI surface would expose this pattern. Likely clarifies when item 12 (Template Library concept) is defined.
