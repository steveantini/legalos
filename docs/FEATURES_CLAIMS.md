# Features-tour claims map

Each claim on `/features` (`app/(marketing)/features/page.tsx`), mapped to the
decision-log entry or commit that makes it true. This file is the currency
mechanism for the product tour (D-157):

- **Truth passes diff this file against the page.** If a claim has no source,
  it is an overclaim; if a shipped change isn't reflected here and on the
  page, the tour has drifted.
- **Feature commits append here.** Any commit that changes user-facing
  behavior reconciles `/features`, the README, and this map in the same
  commit (the standing rule, D-157, recorded in CLAUDE.md).

The README's capability paragraph makes the same claims with engineering
nuance; it reconciles on the same rule. The deeper security claims live in
`docs/SECURITY_ARCHITECTURE.md` and the /trust pages (D-126/D-129).

The page was reorganized into six sections (D-218): the workspace, agents and
departments, knowledge, workflows, admin and governance, and control. Document
Comparison folded into Agents; Connections and Measurement folded into Admin and
governance; the standalone `#document-comparison`, `#connections`, and
`#measurement` anchors retired (the `/connections` and `/integrations` redirects
remapped to `#governance`). Two staleness fixes baked in: the false
"conversations that pick up where they left off" claim removed (no
conversation-history UI exists), and connected-tool use framed as a governed
capability (reading open, writes built to pause) rather than asserting agents
actively run connected tools today.

Last full truth pass: 2026-06-30 (D-218, the six-section reorg).

## The workspace (`#workspace`)

| Claim | Source |
|---|---|
| Launchpad organized by department; access-scoped views | D-074 IA; the workspace home arc |
| References attached; agent works from your documents | Agent/message attachments (0007-era; D-067 live Drive reads) |
| Any response downloads as a document | Per-message Word export (D-054; `formatted_outputs`) |
| Deleted work recoverable for thirty days | Soft delete + 30-day undo (trash surface) |
| Today: connect Google Calendar in one click; the day's schedule appears on the home, read-only, merged across visible calendars in time order with a live now-and-next marker; never writes | D-174 (`google-calendar` adapter on the Drive OAuth path, `calendar.events.readonly` + `calendar.calendarlist.readonly`, multi-calendar merge, Today card); D-176 (now/next island, per-calendar color, meta) |
| Impact: the home shows your own measured usage (agent runs, most-used agent), and the hours/cost given back once an admin sets up the productivity calculator; measured vs. estimate labeled | D-143 (Impact cells; agent-runs/top-agent always measured, hours/cost gated on the task book); D-142/D-145 (the honesty line) |
| Matters (coming soon): active matters/deals will sync from a CLM or matter-management tool, read-only; shown as the available-soon preview today | `components/workspace/home/matters-section.tsx` (`isMattersConnected` returns false; the available-soon card is the only state; rich view built and dormant); roadmap item 2 (CLM/matter-management adapter not yet built) |
| A Desk of personal content feeds: add a newsletter, podcast, or news source by URL, see its latest post as a card linking out | D-173 (`desk_feeds`, 384f467; cards + server-side cached, safe-fetch guarded) |
| Any link resolves: a feed, an ordinary page (feed auto-discovered), or an Apple Podcasts show (resolved to its feed) | D-173 (autodiscovery 659a479; Apple Podcasts lookup 93b4ea4) |
| Feeds are personal and user-managed (add/remove, up to 12); admin-curated role-scoped Desk content is the named future layer, not shipped | D-173 (owner-scoped RLS; sibling-table architecture for the future layer) |

(Removed: "Conversations kept and resumable." Conversations persist in the DB and a thread rehydrates on a hard reload via `?c=`, but there is NO conversation-history UI for a user to discover or resume past conversations, and opening an agent starts a fresh conversation; the `ConversationCard` built for a "Continue working" row is dead code. The page no longer claims it.)

## Agents and departments (`#agents`)

| Claim | Source |
|---|---|
| Departments across four practice clusters (deal work, regulatory and compliance, specialized practice, operations); the copy states no hard number | Departments seed: **eleven** active by default (Commercial, Corporate, Regulatory, Privacy, AI Governance, Product, Employment, IP, Litigation, Operations, General Tools); Public Sector and Compliance soft-deleted in migration 0043 (the old "thirteen" is stale) |
| Four clearly marked agent tiers: Approved agents (department-vetted), Powered by legalOS (free first-party, fully locked, copy-to-own), a curated library of Anthropic's Claude for Legal agents imported and governed inside legalOS, My agents | D-149 (the Approved-agents rename + group sublines, 28668d4); the tiered architecture; C4L import (D-051/D-110–D-114); the legalOS system tier (D-180/D-181); the C4L framing (imports/curates/governs, not vendor/fork) recorded in D-214 |
| Anyone creates an agent with instructions and references | User-owned My agents; the agent form |
| Access follows roles | RBAC + `user_department_roles` (0001) |
| General Tools, the built-ins that ship free: general-purpose agents ready to use and yours to copy (a summarizer, a clause/term extractor, an obligations reviewer, a plain-language rewriter, and more) | D-181 (the General Tools agents, `lib/content/builtin-agents-seed.ts`, fully-locked first-party, copy-to-own) |
| Document Comparison: the first built-in, with a deterministic comparison returning both a plain-language explanation AND a visual redline, both from one comparison so they agree; changes found by code, not guessed; "the part that has to be right is not left to a model's judgment" | D-185 (engine), D-186 (deterministic pre-step pattern), D-187 (agent), D-189 (visual redline). Folded into Agents (the `#document-comparison` anchor retired) |

## Knowledge (`#knowledge`)

| Claim | Source |
|---|---|
| Knowledge management without moving your knowledge: files stay a single source of truth, read where they live so legalOS always works from the current version (version control intact), no one reasoning from a drifted copy; files never move, contents never stored, only a metadata inventory | D-152 (folders model, metadata-only inventory, transparency rule), D-195/D-207 (drive-agnostic, off the "Collections" concept), D-218 (the single-source-of-truth / version-control framing) |
| Research, for questions that need judgment (non-deterministic): a citation-backed answer across the folders you choose, and for each document it draws on it shows the exact line it used so you can check against the source | D-153 (the engine; findings-only persistence; live reads, no full text, no search index), D-218 (the "exact line it used / check against the source" framing) |
| Agents use the same capability inline; larger questions point at the Research page (governed capability, not asserted as always-on) | D-155 (the native tool, 15-document inline cap, honest handoff); softened framing in c4cbd6c |
| Honest preview before each run; unreadable documents reported plainly | D-153 (preview + basis lines) |
| Structured Query, for questions that need a count (deterministic): ask in plain language, get a precise count you can check, with a supporting quote per matching document | D-197/D-198/D-199 (anchor, schema, extraction with verified citations), D-200 (the pure deterministic engine), D-201 (the NL question surface), D-209/D-210 (per-set document kind + folder-picking) |
| Schema-grows-on-demand: ask about something not tracked, suggest it; an admin reviews and approves the new field before it becomes permanently queryable, citation-backed, never an on-the-fly guess | D-202 (member-suggests/admin-approves; model-drafted definition with admin review before commit; reuses Prepare/Update) |

## Workflows (`#workflows`)

| Claim | Source |
|---|---|
| No-code builder; start from a template or scratch | D-118 (builder), D-124/D-125 (templates) |
| Supervised or autonomous runs; any step that would change something outside legalOS pauses for approval before it acts | D-117 (autonomy + approved writes), D-121/D-122 |
| Complete step-by-step run record with approval provenance | D-116/D-119 (run + step-run audit) |

## Admin and governance (`#governance`)

| Claim | Source |
|---|---|
| The control surface splits into two halves you see in the product: Govern and Measure | D-074 (admin IA: the GOVERN/MEASURE captioned groups); `lib/admin/nav.ts` |
| Govern · People: least-privilege roles, invitations, reversible deactivation | D-079/D-080/D-081 (People) |
| Govern · Policy and access: which connection kinds are permitted, default model, read-only vs read-and-write, the research document cap | D-076 (categories), D-078 (default model), D-153 (research cap) |
| Govern · Connections live here: a pre-vetted catalog (contract lifecycle, document management, e-discovery, court data, productivity); Google Workspace verified end to end, the rest pre-vetted and verified as each customer enables it | D-150 (the C4L connector harvest, 932637d), D-151 (drift detection), D-106 (Google proven live), D-150 status split (AVAILABLE vs VERIFIED) |
| Govern · Connections reach only official first-party servers or servers your own organization hosts; reading is open while any change-making action is built to pause for a person to approve | D-089/D-093 (trusted registry + self-hosted path), `connection_secrets` custody; D-105 (gated loop), D-107/D-108 (write confirmation); softened "built to pause" framing in c4cbd6c (governed capability, gated by `MCP_AGENT_TOOLS_ENABLED`) |
| Govern · Audit log records privileged actions (role changes, deactivations) for administrators to read | D-083 (audit log) |
| Measure · Insights: adoption and engagement from real, measured usage | D-082/D-144 (Insights) |
| Measure · Productivity: estimates time and cost saved, combining measured usage with assumptions you control (salary, time per task); measured vs. estimate labeled wherever a number shows | D-142 (hybrid calculator), D-177 (agent-mapped, measured-only volume), D-142/D-145 (the honesty line) |
| Measure · Evals (coming soon): will be how you check that outputs meet your standard; marked coming-soon on the page, not claimed as shipped | `app/workspace/admin/evals/page.tsx` + `lib/admin/nav.ts` (the Evals MEASURE item is a coming-soon stub, `AdminComingSoon`; A5 deferred as an open design question). The page now marks it "(coming soon)" with future tense, consistent with Matters |

## Control on your terms (`#control`)

| Claim | Source |
|---|---|
| Meets you where you are: reaches the systems you already run, first-party or servers your own organization hosts | D-089/D-093 (trusted registry + self-hosted MCP path, `SELF_HOSTED_SERVER_ID_PREFIX`) |
| Model-agnostic by design: managed AI or bring-your-own provider account under your own agreement and data boundary; you hold model choice and cost exposure, no lock-in. NO on-prem deployment claimed | D-085–D-088 (models-as-a-connection, `lib/llm/models.ts`); D-087 (BYO-key, `lib/llm/model-credential.ts`); D-136 (per-org BYO scoping) |
| Experts stay in command: across every autonomy mode, anything that would change something outside legalOS waits for a human to approve | D-117 (`AutonomyLevel`; `lib/workflows/engine.ts` pauses in EVERY mode); D-105/D-107 (the chat write-confirmation) |
| Summary: control over the models you run on, the privacy of your work, and the connection to the tools you use | The facets above |

## Closing claims

| Claim | Source |
|---|---|
| "Everything above is shipped capability, except where it is marked coming soon" | The D-126 standing rule; this map is its enforcement. Two items carry the "(coming soon)" marker: Matters (CLM sync, roadmap item 2) and Evals (the deferred A5 stub) |
