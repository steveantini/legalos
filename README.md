# legalOS

An operating system for legal departments. legalOS gives in-house lawyers and legal-ops teams a single, AI-native entry point for the workflows, agents, and tools they use day-to-day — built around how legal work actually happens, with role-based access, conversation history, attached references, web search, and per-message markdown download already in place.

This is open-source software you can fork and run for your own legal department, or adapt as the starting point for a multi-tenant SaaS.

## Current phase

**Phase 2 polish phase.** Three-tier agent architecture (canonical Department Agents, Claude for Legal imports, user-owned My Agents) across a 13-department launchpad behind RBAC. Native chat with prompt caching, web search, attached references, per-message markdown download, soft delete + 30-day undo, and an admin area are live. See [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) for the full phase plan.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| Backend | Next.js API routes + server actions |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Supabase Auth (magic link) |
| AI / LLM | Anthropic API (Claude); multi-vendor scaffolding in place, adapter implementations land in Phase 6 |
| Hosting | Vercel |

## Documentation

- [`SETUP.md`](./SETUP.md) — fork this repo and run it locally or deploy to Vercel.
- [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) — phase plan, architecture, roadmap.
- [`CLAUDE.md`](./CLAUDE.md) — coding conventions and AI-assistant rules.
- [`DECISION_LOG.md`](./DECISION_LOG.md) — architectural decisions and their reasoning.
- [`CHANGELOG.md`](./CHANGELOG.md) — version history.

## Future / Backlog

Features and surfaces deliberately deferred. Capturing intent here so it isn't lost.

- **In-app support chat** — replaces the legacy floating support button removed in 10b. User-initiated chat surface for product support; surfaces from inside the workspace chrome rather than emailing legal-ops out-of-band.
- **Card access-rights treatment.** Department and agent cards conditionally rendered as inactive based on user role. Inactive cards visually disappear into the page background (`bg-background` instead of `bg-card`, no shadow, no hover state, click target disabled or removed) so users see that other surfaces exist without being able to act on them. Implementation when needed: add an `inactive` boolean prop to DepartmentCard and AgentCard; conditional className swaps the surface tone and removes the slate-blue hover treatment introduced in session 15.
- **Document export.** Export agent conversations and individual responses to Word (.docx), Google Docs, and additional document formats. Currently messages can be downloaded one-at-a-time as markdown via the per-message DownloadMessageButton; full conversation export and rich document formats are not yet implemented.
- **Enriched admin-landing cards.** The grouped cards on `/workspace/admin` (Session 30 — D-046) currently mirror the admin rail one-to-one — static title + description per tool. Promote each card to a glanceable dashboard tile that surfaces live data: User Access card shows seat count + last invitation sent, Adoption Metrics card shows a 7-day sparkline of weekly active users, Productivity Calculator card shows the latest computed hours-saved value with deltas. Empty / loading / error states designed per card. Refresh model: server-rendered with `revalidate` per tile. The current strict-mirror landing is the deliberate staging point; enrichment unlocks the surface's full value once there's usage signal to drive which metrics matter to surface.
- **Workspace dashboard.** A five-card cards-grid dashboard at `/workspace` surfacing the product's full set of domains (Departments, Knowledge, Workflows, Integrations, Help) — replacing the current department-launcher hero. Attempted in Session 31 and reverted (D-047): the dashboard worked structurally but felt like a downgrade from the existing hero because four of five cards announced placeholder content via "Preview" pills. The right time to promote `/workspace` to a category dashboard is when the categories have real content to surface — likely once the Knowledge / Workflows / Integrations / Help surfaces have shipped (they remain deferred per the post-polish backlog). When this ships, the dashboard cards become genuine entry points to working surfaces rather than navigation placeholders, and the entrance animation choreography (stagger-children fade-in, already designed and reverted) can come back with the cards earning their keep.
- **Regulatory monitors.** Continuous scanning of global regulation scoped to a user-configured regulatory perimeter (jurisdictions + topics), surfacing changes via a triaged feed with summary, metadata, and source links. Compare/assess/assign workflow for each change with audit trail. Distinct product from the agents surface (Monitors runs continuously rather than per-query), distinct from Knowledge (Monitors watches for new content rather than answering questions about existing content). Modeled after Legora's Monitors product. Considered for Session 31's rail taxonomy and explicitly scoped out as too large to fit alongside the rail restructure; deferred to its own future session.
- **Demo access.** Per-session isolated demo workspace for distributing trial access to specific people via single-use invitation links — no real email collected, fresh seed of realistic Demo Org data per user, 7-day TTL with auto-cleanup. Architecturally additive (doesn't modify existing auth, RLS, or role flows); D-049 documents the decision and `docs/DEMO_ACCESS_SCOPING.md` is the build spec. Estimated 1-1.5 sessions when prioritized.

## License

TBD. A license file will be added before the first public release.
