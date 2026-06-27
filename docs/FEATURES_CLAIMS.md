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
| Four clearly marked agent tiers: Approved agents (department-vetted), Powered by legalOS (free first-party, fully locked, copy-to-own), the Claude for Legal curated library, My agents | D-149 (the Approved-agents rename + group sublines, 28668d4); the tiered architecture; C4L import (D-051/D-110–D-114); the legalOS system tier (D-180 plumbing, D-181 the five General Tools agents, D-186/D-187 Document Comparison as the sixth — the first to carry a deterministic pre-step) |
| Anyone creates an agent with instructions and references | User-owned My agents; the agent form |
| Access follows roles | RBAC + `user_department_roles` (0001) |
| Document comparison: a deterministic comparison returning both a plain-language explanation of what changed and what matters AND a visual redline of the exact changes, both from one comparison so they agree | D-185 (engine), D-186 (pre-step pattern, prose), D-187 (agent), D-189 (visual redline renderer); `#document-comparison` |

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
| You point legalOS at folders in your connected (cloud) drives and ask across the folders you choose (drive-agnostic copy); the source path of every folder is shown; legalOS keeps a metadata-only inventory, files never move and their contents are never stored | D-152 (Step 1; transparency rule; Drive enumeration verified live), D-195 (copy clarified, drive-agnostic), D-207 (reframed off the "Collections" managed concept to the folders model) |
| Citation-backed answers with per-document findings; documents read live and never copied; legalOS stores no full document text and builds no search index; what it keeps for an answer is the findings plus a short verbatim supporting quote (≤600 chars) per document, so the answer is verifiable | D-153 (the engine; findings-only persistence), D-195 (corrected from the earlier "nothing copied or stored" overstatement to the verifiable-quote framing) |
| Agents use the same capability inline; larger questions point at the Research page | D-155 (the native tool, 15-document inline cap, honest handoff) |
| Honest preview before each run; unreadable documents reported plainly | D-153 (preview + basis lines) |
| Structured Query: ask an exact question in plain language about a collection's defined fields and get a precise count you can check; the exact/repeatable companion to Research's read-and-reason | D-197/D-198/D-199 (anchor, schema, extraction with verified citations), D-200 (the pure deterministic query engine), D-201 (the NL question surface: model translates to the IR, pure engine counts, interpreted query shown and re-runnable) |
| The interpreted query is shown in plain language and the count's honesty caveats (unverified citations, not-found, partially-read, unprepared) are reachable, not hidden; each matching document carries its supporting quote | D-200 (engine caveats + matched ids), D-201 (presentation: exact lead, reachable caveats, per-document citations, stale-data notice) |
| Asking about a field the collection does not track is answered honestly by naming what it does track (no opaque failure) | D-201 (the honest-gap response; the phase-two schema-grows-on-demand seam) |
| Schema-grows-on-demand: a member can suggest tracking a missing field; a model drafts it; an admin reviews/edits and approves; on approval it is added and (after a deliberate Update) becomes a permanent, citation-backed, exactly-queryable field, never an on-the-fly guess | D-202 (member-suggests/admin-approves via a single changeable approval gate; model-drafted definition with admin review/edit before commit; reuses derived-staleness + Prepare/Update, no new extraction and no auto-run) |

## Measurement (`#measurement`)

| Claim | Source |
|---|---|
| Personal impact on the home page (runs, most-used agent, hours/cost given back) | D-143 (Impact cells) |
| Leader view of adoption and engagement, real measured usage | D-082/D-144 (Insights) |
| Built-in calculator: measured usage × your assumptions, agent-mapped and measured-only (no manual-estimate volume) | D-142 (hybrid calculator); D-177 (manual-estimate path removed, calculator agent-mapped only) |
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
