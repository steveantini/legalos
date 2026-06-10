# legalOS

An operating system for legal departments. legalOS gives in-house lawyers and legal-ops teams a single, AI-native entry point for the workflows, agents, and tools they use day-to-day — built around how legal work actually happens, with role-based access, conversation history, attached references, per-message file attachments, web search, and per-message markdown download already in place.

This is open-source software you can fork and run for your own legal department, or adapt as the starting point for a multi-tenant SaaS.

## Current state

The product is well past its initial phase. Live today: the three-tier agent architecture (department-approved Approved agents, Claude for Legal imports, user-owned My agents) behind RBAC; native chat with prompt caching, web search, attached references, per-message file attachments and markdown download, and soft delete with 30-day undo; an admin area (Policy and access, People, the audit log); the Share and connector hub with Google Drive OAuth and live Drive reads; a pre-vetted catalog of legal-system connectors (contract lifecycle, document management, e-discovery, court data, research, and productivity) in the trusted MCP registry, each disabled by default and ready to enable per organization with its own credentials; a no-code Workflows product (builder, deterministic engine, human-approved writes, runs and audit, starter templates); the full public marketing surface (Trust Center, About, Mission, Connections, FAQ, Contact, Blog, Documentation, and the Legal document drafts); demo access (a shared, seeded, RLS-isolated Demo Workspace reached by a no-email access link); and a measurement layer: each person sees their own impact (runs, most-used agent, hours and cost given back) on the home page, admins get adoption and engagement insights plus a productivity calculator that estimates the return by combining measured usage with the organization's own assumptions, and the platform owner has an internal cross-customer analytics view. The measured-vs-estimated line is labeled honestly throughout: usage figures are real measured usage, the return is an informed estimate. Connections and the connection policy, including bring-your-own model keys, are scoped per organization. See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for the live state and what's next, and [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) for the architecture.

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
- **Document export.** Export agent conversations and individual responses to Word (.docx), Google Docs, and additional document formats. Per-message Word (.docx) export ships today via the kebab destination hub on the chat message action row (with citation footnotes, a Sources section, and a branded footer); full-conversation export and additional formats (Google Docs, and similar) are deferred to the Share & connector hub (roadmap item 1).
- **Enriched admin-landing cards.** The grouped cards on `/workspace/admin` (Session 30 — D-046) currently mirror the admin rail one-to-one — static title + description per tool. Promote each card to a glanceable dashboard tile that surfaces live data: User Access card shows seat count + last invitation sent, Adoption Metrics card shows a 7-day sparkline of weekly active users, Productivity Calculator card shows the latest computed hours-saved value with deltas. Empty / loading / error states designed per card. Refresh model: server-rendered with `revalidate` per tile. The current strict-mirror landing is the deliberate staging point; enrichment unlocks the surface's full value once there's usage signal to drive which metrics matter to surface.
- **Workspace dashboard.** A five-card cards-grid dashboard at `/workspace` surfacing the product's full set of domains (Departments, Knowledge, Workflows, Integrations, Help), an alternative framing to the current value-mirror home (greeting, Today, Impact, Matters, Desk). Attempted in Session 31 and reverted (D-047): the dashboard worked structurally but felt like a downgrade from the existing hero because four of five cards announced placeholder content via "Preview" pills. The right time to promote `/workspace` to a category dashboard is when the categories have real content to surface — likely once the Knowledge / Workflows / Integrations / Help surfaces have shipped (they remain deferred per the post-polish backlog). When this ships, the dashboard cards become genuine entry points to working surfaces rather than navigation placeholders, and the entrance animation choreography (stagger-children fade-in, already designed and reverted) can come back with the cards earning their keep.
- **Regulatory monitors.** Continuous scanning of global regulation scoped to a user-configured regulatory perimeter (jurisdictions + topics), surfacing changes via a triaged feed with summary, metadata, and source links. Compare/assess/assign workflow for each change with audit trail. Distinct product from the agents surface (Monitors runs continuously rather than per-query), distinct from Knowledge (Monitors watches for new content rather than answering questions about existing content). Modeled after Legora's Monitors product. Considered for Session 31's rail taxonomy and explicitly scoped out as too large to fit alongside the rail restructure; deferred to its own future session.

(Demo access shipped, so it is no longer a backlog item: a shared, seeded, RLS-isolated Demo Workspace reached by a single-use no-email access link, per D-132/D-133. The richer per-session-isolated model remains a documented additive future in `docs/DEMO_ACCESS_SCOPING.md`.)

## License

TBD. A license file will be added before the first public release.
