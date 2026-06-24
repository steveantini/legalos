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

Last full truth pass: 2026-06-12 (D-157).

## The workspace (`#workspace`)

| Claim | Source |
|---|---|
| Launchpad organized by department; access-scoped views | D-074 IA; the workspace home arc |
| Conversations kept and resumable | Native chat (D-023 onward) |
| References attached; agent works from your documents | Agent/message attachments (0007-era; D-067 live Drive reads) |
| Any response downloads as a document | Per-message Word export (D-054; `formatted_outputs`) |
| Deleted work recoverable for thirty days | Soft delete + 30-day undo (trash surface) |
| A Desk of personal content feeds: add a Substack, podcast, or news source by URL, see its latest post as a card linking out | D-173 (`desk_feeds`, 384f467; cards + server-side cached, safe-fetch guarded) |
| Any link resolves: a feed, an ordinary page (feed auto-discovered), or an Apple Podcasts show (resolved to its feed) | D-173 (autodiscovery 659a479; Apple Podcasts lookup 93b4ea4) |
| Feeds are personal and user-managed (add/remove, up to 12); admin-curated role-scoped Desk content is the named future layer, not shipped | D-173 (owner-scoped RLS; sibling-table architecture for the future layer) |

## Agents and departments (`#agents`)

| Claim | Source |
|---|---|
| Thirteen departments across four practice clusters | Departments seed; CLAUDE.md overview |
| Three clearly marked agent tiers: Approved agents (department-vetted), the Claude for Legal curated library, My agents | D-149 (the Approved-agents rename + group sublines, 28668d4); the three-tier architecture; C4L import (D-051/D-110–D-114) |
| Anyone creates an agent with instructions and references | User-owned My agents; the agent form |
| Access follows roles | RBAC + `user_department_roles` (0001) |

## Workflows (`#workflows`)

| Claim | Source |
|---|---|
| No-code builder; start from a template or scratch | D-118 (builder), D-124/D-125 (templates) |
| Supervised or autonomous runs; writes always pause for approval | D-117 (autonomy + approved writes), D-121/D-122 |
| Complete step-by-step run record with approval provenance | D-116/D-119 (run + step-run audit) |

## Connections (`#connections`)

| Claim | Source |
|---|---|
| Pre-vetted connector catalog: contract lifecycle, document management, e-discovery, court data and research, productivity (named examples) | D-150 (the C4L harvest, 932637d); drift detection D-151 |
| Enabling = a toggle plus your credentials, trusted boundary | D-089 (trusted-only registry), D-092 (governed connect flow) |
| Google Workspace verified end to end; the rest pre-vetted rather than live-tested, verified as enabled | D-106 (Google proven live); D-150 status split (CourtListener AVAILABLE pending the operator vet) |
| Connect Google Calendar in one click; today's schedule, gathered across every visible calendar and merged in time order, appears on the home with per-calendar color, each event's location and length, join and open-in-Google links, and a live now/next indicator, read-only, never writes | D-174 (`google-calendar` adapter on the Drive OAuth path, `calendar.events.readonly` + `calendar.calendarlist.readonly`, all-day events handled, multi-calendar merge, Today card); D-176 (per-calendar palette color, location/duration meta, join/open-in-Google links, client now/next island) |
| Reads run free; writes pause for per-action approval | D-105 (gated loop), D-107/D-108 (write confirmation) |
| First-party or self-hosted servers only; encrypted credentials, never in the browser | D-089, D-093, `connection_secrets` custody |
| Model-agnostic: managed or bring-your-own provider account | D-085–D-088 (models-as-a-connection, BYO key) |

## Knowledge (`#knowledge`)

| Claim | Source |
|---|---|
| Collections drawn over repositories you already use (Google Drive named); every collection shows its sources | D-152 (Step 1; transparency rule; Drive enumeration verified live) |
| Citation-backed answers with per-document findings; documents read live; nothing copied or stored; inventory of titles only | D-153 (the engine; findings-only persistence) |
| Agents use the same capability inline; larger questions point at the Research page | D-155 (the native tool, 15-document inline cap, honest handoff) |
| Honest preview before each run; unreadable documents reported plainly | D-153 (preview + basis lines) |

## Measurement (`#measurement`)

| Claim | Source |
|---|---|
| Personal impact on the home page (runs, most-used agent, hours/cost given back) | D-143 (Impact cells) |
| Leader view of adoption and engagement, real measured usage | D-082/D-144 (Insights) |
| Built-in calculator: measured usage × your assumptions | D-142 (hybrid calculator) |
| Measured vs. estimate labeled everywhere | The D-142/D-145 honesty line |

## Admin and governance (`#governance`)

| Claim | Source |
|---|---|
| Roles with least-privilege rules; invitations; reversible deactivation | D-079/D-080/D-081 (People) |
| Policy & access: connection categories, default model, read-only vs read-and-write, the research document cap | D-076 (categories), D-078 (default model), D-153 (research cap) |
| Role changes and deactivations recorded to a readable audit log | D-083 (audit log) |

## Control on your terms (`#control`)

| Claim | Source |
|---|---|
| Meets you where you are: reaches the systems you already run, first-party or servers your own organization hosts | D-089/D-093 (trusted registry + self-hosted MCP path, `SELF_HOSTED_SERVER_ID_PREFIX`) |
| Model-agnostic by design; run on the models you choose, not a single engine wired in | D-085–D-088 (models-as-a-connection seam, `lib/llm/models.ts`); the agent-form model picker. NO on-prem deployment claimed: models run managed or under your own provider account, not a legalOS on-prem install |
| Your models, your call: managed or bring-your-own provider account, under your own agreement and data boundary; you hold model choice and cost exposure, no vendor lock-in | D-087 (BYO-key branch, `lib/llm/model-credential.ts`); D-136 (per-org BYO scoping) |
| Experts in command: domain experts keep agency; the autonomy dial runs supervised to autonomous, but any action that would change something outside legalOS pauses for approval in EVERY mode, including the most autonomous | D-117 (`AutonomyLevel`; `lib/workflows/engine.ts` "pauses for approval in EVERY autonomy mode"); D-105/D-107 (the chat write-confirmation) |
| Summary: control over the models you run on, the privacy of your work, and the connection to the tools you use | The three facets above |

## Closing claims

| Claim | Source |
|---|---|
| "Everything above describes shipped capability" | The D-126 standing rule; this map is its enforcement |
