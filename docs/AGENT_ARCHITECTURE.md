# Agent Architecture

**Status:** Living Document
**Last updated:** 2026-04-28 (Session 8c)

This document is the design specification for the agent product surface in `legal-department-launchpad-template`. Phase 2 originally landed with a single hardcoded native agent so the runtime could be smoke-tested end-to-end (Sessions 8a / 8b — see DECISION_LOG D-023). After that runtime came online, the product scope was deliberately expanded: native agents are no longer "one of two columns on a launchpad," but user-owned, user-configurable workspaces with attached references, configurable tools, multi-format output, and a forward path to multi-vendor model support. D-025 records the scope decision; this document is the spec the subsequent Phase 2 sessions implement.

It is not a decision log entry — DECISION_LOG.md handles single-question commitments. It is not a migration plan — that lives session by session as work proceeds. It is the architectural shape: what an agent _is_, what surfaces a user can tune, how data and tools attach to an agent, what gets sent to the model, and what the system explicitly does not yet do.

Two things to read alongside this document. First, CLAUDE.md's "AI Integration Rules" and "Security Non-Negotiables" sections are load-bearing here — every architectural choice below either honors a rule from those sections or explicitly cites why a rule does not apply. Second, DECISION_LOG D-023 is the runtime foundation this document extends; the SSE contract, cost-tracking hook, prompt-injection preamble, and rate limiter from 8a are unchanged and remain the substrate everything below sits on.

---

## Section 1 — What an agent is

An agent in v1 is a user-owned, user-configurable workspace. A user creates an agent, owns it, edits it, and is the only person who can see or use it. There is no organization-shared agent, no department-shared agent, and no peer-to-peer sharing; everything is owner-private at the RLS layer until a future ADR opens visibility (see "Deferred items" at the end of this document for the upgrade path). This is the smallest correct ownership model for a product that handles attorney work product, and it deliberately leaves the more complicated multi-user surface for later, when there is real evidence about how legal teams want to share.

The current `agents` table holds three kinds of rows after this architecture lands. The first is the **template** — a row with `is_template = true`, owned by the system and not by any individual user, that exists to be forked. The six existing seeded Commercial agents become read-only templates. A seventh "Blank Agent" template ships alongside them with an empty system prompt, sensible model and format defaults, and copy that guides a user through creating an agent from scratch. Templates are never edited in place; they are either updated by a future migration / seed change (which becomes a system change, not a user change) or replaced wholesale. The second kind of row is a **user-owned agent** with `is_template = false`, `created_by = <user>`, populated by forking a template (which copies the template's editable fields to a fresh row tied to the user) or by creating from the Blank Agent template. The third kind is the existing **external agent** type, which this architecture does not change — the launchpad continues to render external cards alongside native ones.

The Test Smoke Agent that Sessions 8a/8b validated the runtime against will be retired once the first real user-created native agent ships. Retirement is a seed cleanup task and is not part of Session 8c; the implementation phasing section below sequences it after the agent CRUD surface lands so there is no observable gap between "test agent goes away" and "real agents work."

### Versioning is deferred, and that is OK

Native agents have a system prompt, a model id, and (after this architecture lands) attached references and a tools list — all of which can change after a user starts a conversation. The naive worry is that editing the prompt under a live conversation breaks reproducibility for older conversations. It does not, because Session 8a's `conversations` table already snapshots `system_prompt_snapshot` and `model_snapshot` at conversation creation per CLAUDE.md AI Integration Rules. A conversation started today against an agent the user later edits keeps replaying with today's prompt and model when re-rendered. The transcript is the conversational record; the snapshot is the configuration record; together they reproduce the original session faithfully.

What this _doesn't_ give us is an "agent at point in time" view across multiple conversations — i.e. the ability to ask "what did this agent look like on March 1?" That requires either a true `agent_versions` table (one row per edit, with a `version` foreign key on `conversations`) or a temporal table pattern. Both are real work and would shift the schema noticeably; both are also roughly orthogonal to v1's goals. The deferred path is recorded in the deferred items list, with the trigger condition: when a user complains that they cannot see what an agent _used to_ look like, version the agent. Until then, the per-conversation snapshot is enough.

### Sharing is deferred

The default visibility in v1 is owner-only, enforced at RLS. Architecturally there are two ways sharing can land later, and which one we pick depends on the use case the user actually surfaces. The first is an `agent_shares` table — a many-to-many of agent × user with a role (read / use / edit), which gives explicit per-user sharing and is the right shape for "I built this Salesforce-renewal agent, give it to the four lawyers on the renewals team." The second is a department-level visibility flag on agents — a boolean (or enum) that flips an agent from "owner-only" to "any member of department X." That shape is right for "the M&A team has a generic NDA-review agent everyone uses." The two are not mutually exclusive and a real product likely ships both. The architecture's only commitment in v1 is to keep the RLS policies tight enough that adding either is a clean migration, not a reshape: every read of an agent goes through `(agent.created_by = auth.uid() OR is_template = true)`, and the `OR` arms get extended later.

### Google Drive integration is deferred

Attached references in v1 are uploaded files (PDF, DOCX, TXT, MD, XLSX) stored in Supabase Storage. The eventual Drive integration — a user pastes a Drive link, the system fetches the document via OAuth, and either text-extracts it or sends it natively — is enough work that it is its own session. The architecture preserves the path by adding a `source_type` enum on the attachments table with values `upload` (v1) and `gdrive_link` (deferred), so adding Drive later is a pure additive: a new enum value, a new resolver behind it, no change to the rest of the attached-references surface.

### Prompt caching is required from day one

This is the architecture's strongest commitment about the runtime. Prompt caching is _not_ a "performance optimization we can defer" — it is required architecture from the first user-created native agent. The reason is straightforward: native agents have system prompts that may run several thousand tokens, plus attached references that can run _tens_ of thousands of tokens (a contract playbook, an org standard, a redline checklist). Sending all of that uncached on every turn is both expensive and slow. With prompt caching wired in, the system prompt + attached references go into the cached portion of every Anthropic request and the per-turn user content stays uncached. Cache reads cost an order of magnitude less than fresh prompt tokens, and the latency win is the dominant factor in chat UX past the first turn.

Two consequences flow from this. First, the existing `usage_events` table needs new columns — `cache_creation_tokens` and `cache_read_tokens` — so cost analytics correctly attribute the cache portion of every call. Without those, cost-per-conversation reports will look anomalously cheap on subsequent turns and break any future budget alerting. Second, the Anthropic adapter (today's `lib/anthropic/`, tomorrow's `lib/llm/anthropic/`) needs to set the `cache_control: { type: "ephemeral" }` marker on the system prompt and on each attached reference block. Both pieces of work are part of "wire prompt caching" in the implementation phasing.

The interaction between caching and per-message file uploads (Section 5a) is worth being explicit about: per-message uploads are _not_ cached, because they are turn-scoped. Permanent attachments _are_ cached. This is the right split — cache hit rates on a 5-attachment agent across a 20-turn conversation are very high; cache hit rates on a "today the user attached a different NDA" file are zero by definition.

Other vendors' caching semantics differ — OpenAI shipped automatic prompt caching in 2024 with no markers required; Google's Gemini prompt caching works differently still. The architecture's commitment is per-vendor: the Anthropic adapter knows about `cache_control` markers, a future OpenAI adapter doesn't need them, a future Gemini adapter sets cache headers per Google's API. This is normal multi-vendor work and is accounted for in Section 6.

---

## Section 2 — User-tunable surface

A native agent in v1 has eight tunable fields. The split between "freeform user input" and "bounded selection from a system list" is deliberate: every freeform field is a place where the user expresses intent specific to their work, and every bounded field is a place where the system prevents misconfiguration that would break the runtime or surprise the user.

The eight fields, with their bucket and a one-line note on why:

- **`name`** — user-editable freeform. The display name shown on the launchpad card and the chat header. No constraint beyond non-empty and a reasonable max length.
- **`description`** — user-editable freeform. The card subtitle. Helps the user remember which agent does what; not surfaced to the model.
- **`system_prompt`** — user-editable freeform with template-provided defaults. The single most important user-tunable field. Forking a template seeds it; the user edits freely after.
- **`model`** — bounded. A dropdown of the supported models (vendor-prefixed, see Section 6) with a one-line description per option ("Claude Sonnet 4.6 — fast, cheap, good for most tasks" / "Claude Opus 4.7 — slower, smarter, best for hard reasoning"). Bounded because picking an unsupported model breaks the runtime and there is no recovery short of editing the agent.
- **`attached_references`** — user-editable. Up to five files, total ≤20MB each, formats restricted to the v1 set in Section 3. Bounded by limits, not by content.
- **`tools_enabled`** — bounded. A list of tools the user toggles on or off, drawn from a system-defined set (v1 ships with one — web search; see Section 5b). Bounded because tools have implementation surface and cost implications; the user cannot define their own tools.
- **`default_output_format`** — bounded. A small enum (`markdown`, `docx` in v1; XLSX, Google Workspace formats, PowerPoint deferred per Section 4). Bounded because each format requires a server-side renderer; the user cannot ship one of their own.
- **conversation memory / context limits** — system-controlled. Not user-tunable. The runtime decides how much of a conversation's history to send to the model, when to truncate, and when to summarize. This is the kind of decision that goes catastrophically wrong if surfaced to a user who is not deliberately tuning context windows; it stays a system concern.

There is no agent icon. The user surfaced this and decided against it: visual identity for an agent comes from name and description, and the cost of "every agent looks like an icon-decision the user didn't want to make" outweighs the small UX benefit of varied iconography. Cards in v1 share a uniform visual treatment, distinguished by name, description, department, and category.

### Templates are read-only

The six Commercial templates and the Blank Agent template are read-only at the database layer (RLS denies UPDATE on `is_template = true` rows except for service-role) and at the UI layer (the agent edit form refuses to render edit controls when the loaded agent is a template). The fork action creates a user-owned copy. This is a stronger guarantee than "users probably won't edit them" — it is enforced at every layer the user touches. The reason for the guarantee is simple: the templates are the shared baseline. If a user could edit a template in place, the next user who forks gets a polluted starting point.

### Single-form agent creation with progressive disclosure

The agent-creation UX is one form, not a wizard. Required fields (name, system prompt, model) are visible by default. Advanced sections — tools, output format, attached references — are collapsible and start collapsed. A user creating their first agent should be able to fill three fields and click Create. A user wiring up a complex workspace should find the advanced surface immediately and not have to click through screens. Progressive disclosure on a single form gets both right; a multi-step wizard gets the second wrong by frustrating power users.

### Deletion is soft, with a 30-day undo

Agents are soft-deleted: a `deleted_at` timestamp on `agents` is set when a user clicks delete, and the agent disappears from the user's launchpad and from conversation history immediately. A 30-day undo window lets the user recover from accidental deletes — the same agent reappears with its prompt, model, attachments, and category intact. After 30 days, a background job hard-deletes (or marks for hard-delete) the row. The 30 days is not load-bearing — it is "long enough that nobody loses real work; short enough that the table doesn't grow forever." Adjustable later.

The same lifecycle applies to attachments (Section 3) — when an agent is deleted, its attachments cascade soft-delete and follow the agent through the 30-day window, so undelete restores both. Conversations are not deleted with their parent agent; they remain in the user's history (with the agent name shown via the existing `system_prompt_snapshot` framing) and continue to be readable. This is a deliberate split — agents are configuration, conversations are work product, and work product survives configuration changes.

### IA: top nav for departments, two sections per department

Information architecture is the same shape it had in Phase 1 with a single addition. Top nav lists the departments the user has access to, exactly as today. Each department page now shows two sections instead of one: **Templates** (system-provided, read-only, the six Commercial cards in their current visual treatment plus the Blank Agent card) and **My Agents** (user-created, user-owned). Within each section, agents are grouped by category. Two clicks gets a user from "logged in" to "in chat with an agent."

Categories within a department are user-private in v1. A user creating their fifth Commercial agent can drop it into a `Renewals` category they made up; another user in the same department doesn't see that category. Department-shared categories — a curated taxonomy that everyone in M&A sees the same way — are a department-shared upgrade and travel with the same ADR that opens up department-level sharing of agents. This is the right pairing because the two features answer the same question (who shares what within a department) and shipping them together avoids a half-state where shared categories are visible but shared agents aren't yet.

### Five starter departments, no AI department

Phase 2's department list is the same five Phase 1 plans for: Commercial, M&A, Public Sector, GR&RA, Privacy. There is deliberately no separate "AI" department. The user considered it and decided against; the right home for an AI-related agent is its natural practice area (a contract-AI assistant lives in Commercial, a privacy-AI assistant lives in Privacy). Carving out an "AI" department would create a parallel taxonomy that doesn't match how lawyers think about their work.

User-creatable departments are deferred. Departments in v1 are fixed-at-deploy data, exactly as Phase 1 has them. The trigger for revisiting is when an org-admin asks for a department the system doesn't have; until then, the additive cost of "let users create departments" (which immediately raises questions about access control, slugs, naming policies, and visual distinctness) outweighs the benefit.

---

## Section 3 — Data inputs (attached references)

Attached references are the second-most important user-tunable surface after the system prompt. A contract-review agent without the user's playbook attached is a generic contract-review chatbot; the same agent with the playbook attached is the user's contract-review chatbot.

### Storage: Supabase Storage, with RLS

Files live in a dedicated Supabase Storage bucket (`agent-attachments` is the working name) with storage policies that mirror the rest of the project's auth model: a user can read and write objects whose `path` starts with their `user_id`, and admin reads cross-user via the same `current_user_role()` helper used in 0004's RLS. This is the same shape D-009 calls for and the same shape every other table in this project enforces. No bucket is public; no presigned URL escapes the user's session.

Files are referenced from a new `agent_attachments` table that holds the metadata: `agent_id`, `storage_path`, `original_filename`, `content_type`, `size_bytes`, `extracted_text` (the cached text extraction so we don't re-extract on every chat turn), `delivery_mode` (Path B in v1, see below), `source_type` (`upload` in v1, `gdrive_link` deferred), `created_at`, `deleted_at`. The extracted-text cache is the load-bearing column — without it, every turn pays the parsing cost on every attachment, which adds up fast on a 5-attachment agent.

### What gets sent to Anthropic: text extraction (Path B)

There are three ways to deliver an attached file's content to a model. Path A is "tell the model the file exists and let it ask for chunks via tool calls" — high latency, high token cost, requires a retrieval tool, mostly worth it for very large corpora. Path B is "extract text from every supported format server-side and inline the text into the system prompt context" — what every general-purpose chat product does. Path C is "send the file natively in formats the model supports (Anthropic's PDF support, OpenAI's vision, Gemini's native multi-format)" plus text extraction as a fallback for unsupported formats — best fidelity, more complex code path.

V1 ships Path B. Server-side extraction libraries handle each format (`pdf-parse` or `pdfjs` for PDF, `mammoth` for DOCX, `xlsx` or `node-xlsx` for XLSX, plain reads for TXT and MD), the extracted text is cached in `agent_attachments.extracted_text`, and that text is what enters the cached prompt portion described in Section 1. The chosen libraries' specifics are an implementation decision deferred to the session that wires this up — the architecture's only commitment is "server-side extraction, results cached, no per-turn re-parsing."

Path C is preserved as the next step. The schema's `delivery_mode` column already accepts the future enum values (`text_extracted` for v1; `native_pdf`, `hybrid` later), and the adapter layer that resolves an attachment to a content block can grow a switch on `delivery_mode` without disturbing the rest of the runtime. This is the right level of forward-compatibility: schema is honest about the future, code today is simple about the present.

### Format support, size limits

V1 supports PDF, DOCX, TXT, MD, and XLSX. These five cover the overwhelming majority of legal-domain documents (contracts, memos, redlines, term sheets, simple data tables). PowerPoint is not in v1 — it is rare in attorney workflows and the format is fiddly to extract well. Image-only PDFs (scanned contracts, signed documents) are handled by whatever the chosen PDF library does with them; OCR is not part of v1.

Size limits: 20MB per file, 5 attachments per agent. The 20MB number is generous for textual legal documents (a 200-page contract weighs perhaps 2–3MB as a real PDF) and headroom for image-heavy uploads; the 5-attachment limit prevents an agent from accumulating an entire deal data room and inflating cache cost without bound. Both numbers are tunable later — they are not in tables, they are constants in the validation layer, and raising them is a one-line change.

### Lifecycle: soft-delete, cascade, transcript-as-record

Attachments soft-delete the same way agents do — a `deleted_at` timestamp, a 30-day undo window, hard-delete after. Removing an attachment from an agent during normal use sets `deleted_at`; deleting the parent agent cascades soft-delete to all its attachments so undelete-the-agent restores everything. The cascade is at the application layer (the soft-delete server action sets `deleted_at` on attachments in the same transaction), not at the FK level — the FK on `agent_attachments.agent_id` is `on delete cascade` for hard deletes only, which fires when the 30-day window closes.

The harder lifecycle question is what happens to a conversation that referenced an attachment after the user updates that attachment. The simpler model — what v1 ships — is this: conversations are pure history. The transcript is the record. Attachment file _contents_ are not preserved against later file updates. If a user attaches `playbook-v1.pdf` on Friday, has a conversation that quotes from it, then on Monday updates to `playbook-v2.pdf`, a re-render of the Friday conversation will show the model's outputs (which are in the transcript) but cannot retrieve `playbook-v1.pdf`'s content. The transcript stands; the file doesn't time-travel.

The audit-grade alternative is to snapshot every attachment's contents into every conversation that uses it — write a row to a `conversation_attachments` table at conversation start, copy the file (or the extracted text) into immutable storage, and replay against the snapshot. This is real cost — storage, copies, and a more complex retrieval path — and it earns its keep when the legal department needs to prove "yes, this agent saw exactly this version of the playbook at this moment" for a regulatory or evidentiary purpose. That is a Phase 7-ish concern, not a v1 concern, and the deferred items list captures it.

---

## Section 4 — Outputs

Output formats are the surface where the user takes a model response out of the chat and into the rest of their work. Two formats ship in v1: markdown rendered inline and Word `.docx` downloads. Everything else is deferred and explicitly listed.

### Markdown rendered in chat (already shipped)

Session 8b shipped markdown rendering with `react-markdown` + `remark-gfm` + `rehype-sanitize`. It treats model output as untrusted (per CLAUDE.md AI Integration Rules) and sanitizes at render-time. This is the default `default_output_format`; nothing changes here. The architecture's only commitment is that markdown does _not_ get a "download as `.md`" button. Copy-paste from chat is the natural UX for plain markdown, and a download button on a format that already lives in the DOM is friction without value.

### Word `.docx` downloads

When an agent's `default_output_format` is set to `docx`, every assistant message in chat shows a "Download as Word" button next to it. Clicking the button hits a server-side renderer that converts the markdown response into a real `.docx` file. The chosen library is most likely the `docx` npm package — it has a clean API for the markdown → DOCX shape and is well-maintained — but the architecture's commitment is "server-side rendering, real download," not the specific library.

A `formatted_outputs` table records every export: `conversation_id`, `message_id`, `user_id`, `format` (`docx` in v1), `storage_path` if the rendered file is persisted, and timestamps. The table earns its keep two ways. First, it is the audit answer for "did this user export this message as a Word doc?" — a real question for a legal department. Second, it lets the UI dedup repeated downloads (clicking the button twice on the same message returns the same file, doesn't re-render). Whether to actually persist the rendered file in Storage or regenerate on demand is an implementation choice; the table's shape supports either.

The "Download as Word" button only appears when `default_output_format = docx`. Other formats — Excel, Google Workspace, PowerPoint — do not ship in v1, and their buttons do not appear in v1 either. The reason for tying button visibility to `default_output_format` is that exposing every possible format on every message is button-noise; the user picked their format at agent-creation, the chat respects that choice.

### What's deferred

Excel (`.xlsx`) is deferred. The use case (an agent that returns a structured data table for download) is real but rare in legal work, and the `xlsx` library lives behind a similar pattern to `docx`; adding it later is the same shape of work as adding `docx`.

Google Docs, Google Sheets, and Google Slides are deferred. Each requires Google OAuth, the Workspace API, format-specific generation, and per-format quirks; each is its own session. The deferred items list captures the trigger condition — when a user explicitly asks for Google Doc export.

PowerPoint (`.pptx`) is deferred for the same reason as XLSX: real but rare in legal work. The `pptxgenjs` library exists; adding `.pptx` later mirrors the `.docx` shape.

---

## Section 5 — Tools

This section is the one most likely to be misread, because "tool" is overloaded. The architecture cleanly separates two concepts that share the word and that the user surfaced as separate during design conversation: a **core chat capability** (per-message file upload, available on every agent) and a **configurable tool** (an entry in the `tools_enabled` list, per-agent enable/disable). They serve different purposes, take different code paths, and need different documentation.

### 5a — Core chat capability: per-message file upload

Every native agent supports per-message file upload. It is not a configurable tool, it is not in `tools_enabled`, and there is no setting to disable it. The chat input gains a paperclip icon next to the send button. The user clicks it, picks a file, the file uploads to Supabase Storage (a separate per-message scope, distinct from the permanent `agent-attachments` bucket described in Section 3), and the file's text-extracted contents enter the user's message turn.

Format support matches Section 3 — PDF, DOCX, TXT, MD, XLSX — and uses the same extraction libraries; the per-message upload reuses the extraction code path but writes into a different storage bucket and table. Per-message uploads are turn-scoped: they are not cached (caching turn-scoped content has no hit rate), and they are not preserved against later edits (the transcript shows what the user attached and what the model said about it; the file itself is retained for some number of days for re-render and then garbage-collected).

Why this is a core capability and not a tool: legal work routinely involves documents the user did not pre-attach. "Here is the NDA the other side sent us, review it against my playbook" is the canonical workflow. The playbook is a permanent attachment; the NDA is a per-message upload; both must exist or the workflow is broken. Configurability is the wrong frame — this is the chat surface every agent ships with, full stop.

### 5b — Configurable tools: the `tools_enabled` list

The `tools_enabled` list is the surface for capabilities that vary per-agent and that the user opts into. V1 ships exactly one tool: web search.

**Web search.** Uses Anthropic's built-in web search tool (the model invokes search itself; the runtime exposes it via the SDK's tools parameter). Each search has a per-search cost on top of token cost — the integration captures both into `usage_events` so cost analytics stay correct. The chat UI shows sources clearly: every assistant message that used search renders the sources inline, with clickable links and visible domain. Lawyers care about provenance, and a citation that the user cannot click is a citation they cannot trust.

The `tools_enabled` field on the agents table is a JSONB list of tool identifiers (`["web_search"]` or `[]`). Storing it as JSONB instead of a normalized join table is a deliberate shortcut for v1 — the tool catalog is small, the list is unlikely to need indexed queries, and migrating to a normalized shape later is straightforward. The cost is that "find every agent that has web search enabled" becomes a JSONB containment query; the win is one fewer table and one fewer join.

Per-agent enable/disable is the only configurability v1 offers. There is no per-tool configuration (no "only search these domains," no "max searches per turn"); everything beyond on/off is deferred to whatever session adds the second tool, at which point a per-tool config shape will become useful.

**Tools deferred to the roadmap.** The likely next candidates are: a calculator tool for legal math (interest, statutory penalties, deadline counting), a date / calendar reasoning tool (statute-of-limitations math, business-day calculations across jurisdictions), Drive read/write (requires the same Google OAuth as the Drive integration in Section 3), and custom-defined org tools — a future feature where an org admin can wire up a tool against a custom API endpoint. Each is its own session; none are blockers for v1.

---

## Section 6 — Model abstraction

V1 is Anthropic-only at the call site. The architecture's commitment is that the codebase is structured for multi-vendor from day one, so adding OpenAI or Google later is additive instead of a refactor.

Three concrete shape changes implement this commitment:

The first is a directory move. `lib/anthropic/` becomes `lib/llm/anthropic/`. The six files inside (`client.ts`, `pricing.ts`, `prompt-defense.ts`, `rate-limit.ts`, `stream.ts`, `types.ts`) move with no internal changes. The new `lib/llm/` parent is the home for sibling vendor adapters: `lib/llm/openai/`, `lib/llm/google/`, etc. Some files migrate up to the parent — `pricing.ts` becomes `lib/llm/pricing.ts` because the pricing table is multi-vendor by nature; `rate-limit.ts` stays vendor-agnostic and also moves up. Vendor-specific files (`client.ts`, `prompt-defense.ts`, `stream.ts`) stay vendor-scoped.

The second is a model-id format change. `agents.model` becomes a vendor-prefixed string. Today's value is `claude-sonnet-4-6`; the new value is `anthropic/claude-sonnet-4-6`. The `pricing.ts` table is keyed on the vendor-prefixed string from the start, so adding `openai/gpt-5.1` later is a row in the same table, no schema change. Existing values are migrated by a one-time SQL update during the move.

The third is a single-case dispatcher. The chat route (`app/api/chat/route.ts`) gains a top-level switch on the vendor segment of `agent.model`. Today there is one case (`anthropic`), which calls the existing Anthropic adapter. Tomorrow there are two or three cases. The dispatcher is a tiny piece of code — perhaps 15 lines including type narrowing — and its only job is to route to the right adapter and let each adapter own streaming, cost computation, prompt-injection delimiters, and SDK quirks.

Multi-vendor _implementation_ is deferred. When OpenAI or Google integration becomes a real session, the work is: write a sibling adapter under `lib/llm/<vendor>/`, add a case to the dispatcher, add the vendor's models to `pricing.ts`, and surface the new models in the bounded model picker (Section 2). No refactor of the runtime is required, because the runtime is already shaped for it.

### Caching and multi-vendor

Prompt caching (Section 1) is currently Anthropic-specific in this codebase. OpenAI added prompt caching in 2024 with different semantics — automatic, no cache markers, prefix-based — and Gemini does it differently still. The architecture's plan for that future is straightforward: each vendor adapter owns its caching strategy. The Anthropic adapter sets `cache_control: { type: "ephemeral" }` markers on the cacheable portion of the prompt; a future OpenAI adapter does nothing because OpenAI caches automatically; a future Gemini adapter sets the appropriate cache headers. The `usage_events` columns (`cache_creation_tokens`, `cache_read_tokens`) are vendor-neutral; each adapter populates them from its own SDK's response shape.

This is the right partition of responsibility, and it is the reason the architecture pushes vendor-specific code into vendor-specific directories rather than building a leaky shared abstraction. The shared abstraction is the request/response contract (the chat route's input and output); the vendor abstraction is the SDK call. Caching lives in the latter.

---

## Schema sketch

This is a non-binding sketch of the database changes the architecture implies. It is **design intent, not final schema** — specific migrations land per session, with the chance to refine column names, defaults, indexes, and constraints. The shape captured here is a forecast, not a contract.

### Existing columns being repurposed

`agents.created_by` already exists in `0001_initial_schema.sql` as `uuid references public.users (id) on delete set null`. The architecture uses this column unchanged — every user-owned agent's `created_by` is the user's ID; templates leave it `null`.

`conversations.system_prompt_snapshot` and `conversations.model_snapshot` already exist from Session 8a's `0004_native_agents.sql`. They continue doing exactly what they do today: snapshotting prompt and model at conversation creation so historical reproducibility is preserved when agents are edited (Section 1's versioning-deferral argument).

### New columns on `agents`

- `is_template boolean not null default false` — flips a row into template mode.
- `forked_from_agent_id uuid references public.agents (id) on delete set null` — provenance for user-owned agents that came from a template (or from another user-owned agent if peer forking ever lands).
- `tools_enabled jsonb not null default '[]'::jsonb` — the bounded list of enabled tool identifiers (Section 5b).
- `default_output_format text not null default 'markdown'` — enum-like, validated in app code; values `markdown` and `docx` in v1.
- `deleted_at timestamptz` — soft-delete timestamp; `null` means active.
- `model` value migrates from `claude-sonnet-4-6` style to `anthropic/claude-sonnet-4-6` style (Section 6). One-time UPDATE on existing rows.

### New table: `agent_attachments`

```
agent_attachments
  id                uuid pk
  agent_id          uuid fk -> agents (on delete cascade for hard deletes)
  user_id           uuid fk -> users (denormalized; supports RLS without join)
  organization_id   uuid fk -> organizations (denormalized; defense-in-depth)
  storage_path      text not null
  original_filename text not null
  content_type      text not null
  size_bytes        bigint not null
  extracted_text    text                       -- cached text extraction
  delivery_mode     text not null default 'text_extracted'
                    -- v1: 'text_extracted'
                    -- deferred: 'native_pdf', 'hybrid'
  source_type       text not null default 'upload'
                    -- v1: 'upload'
                    -- deferred: 'gdrive_link'
  source_metadata   jsonb                      -- e.g. Drive file id, when source_type = 'gdrive_link'
  deleted_at        timestamptz                -- soft-delete
  created_at        timestamptz default now()
  updated_at        timestamptz default now()

  index (agent_id) where deleted_at is null
  index (user_id, created_at)
```

RLS policies mirror the agents table: user owns + admin reads. Storage policies on the underlying `agent-attachments` bucket follow the same shape — paths prefixed with `user_id`, owner read/write, admin cross-read.

### New table: `formatted_outputs`

```
formatted_outputs
  id              uuid pk
  conversation_id uuid fk -> conversations (on delete cascade)
  message_id      uuid fk -> messages (on delete cascade)
  user_id         uuid fk -> users
  organization_id uuid fk -> organizations
  format          text not null              -- 'docx' in v1
  storage_path    text                       -- nullable: regenerate-on-demand allowed
  size_bytes      bigint
  created_at      timestamptz default now()

  index (message_id)
  index (user_id, created_at)
```

RLS: user-owns via parent conversation; admin read across org.

### Extended columns on `usage_events`

- `cache_creation_tokens integer` — tokens written into the cache on this call.
- `cache_read_tokens integer` — tokens read from cache on this call.

Both nullable to preserve compatibility with existing rows from Session 8a, which predate caching. Cost computation is updated in `lib/llm/anthropic/pricing.ts` (post-move) to incorporate cache pricing.

### Per-message attachments

Per-message uploads (Section 5a) need a separate, lighter-weight table. The shape is similar to `agent_attachments` but scoped to a message, not an agent:

```
message_attachments
  id              uuid pk
  message_id      uuid fk -> messages (on delete cascade)
  user_id         uuid fk -> users
  organization_id uuid fk -> organizations
  storage_path    text not null
  original_filename text not null
  content_type    text not null
  size_bytes      bigint not null
  extracted_text  text
  created_at      timestamptz default now()

  index (message_id)
```

A separate Storage bucket (`message-attachments` is the working name) keeps the lifecycle distinct — message attachments are short-lived (kept for re-render, garbage-collected on a longer cadence), while agent attachments live as long as the parent agent.

### `tools_enabled` shape

JSONB array of strings. Validated at write time against the system tool catalog (a constant in code, not a table — the catalog is small and version-controlled, like the model list). V1 catalog: `["web_search"]`. An agent's `tools_enabled` value is some subset, e.g. `[]` or `["web_search"]`.

### Summary

| Object | Status | Net change |
|---|---|---|
| `agents.created_by` | Exists (0001) | Used unchanged |
| `agents.is_template` | New column | `boolean default false` |
| `agents.forked_from_agent_id` | New column | Self-FK |
| `agents.tools_enabled` | New column | `jsonb default '[]'` |
| `agents.default_output_format` | New column | `text default 'markdown'` |
| `agents.deleted_at` | New column | Soft delete |
| `agents.model` | Existing | Value migration to vendor-prefixed |
| `conversations.*_snapshot` | Exists (0004) | Used unchanged |
| `agent_attachments` | New table | Per-agent permanent attachments |
| `message_attachments` | New table | Per-message uploads |
| `formatted_outputs` | New table | Audit + dedup of exports |
| `usage_events.cache_creation_tokens` | New column | Cache cost tracking |
| `usage_events.cache_read_tokens` | New column | Cache cost tracking |
| `agent-attachments` Storage bucket | New | RLS-policied |
| `message-attachments` Storage bucket | New | RLS-policied |

---

## Implementation phasing

This is the list of subsequent Phase 2 work items implied by the architecture, in dependency order. Each is a session-sized chunk; none are numbered (`8d`, `8e`, etc.) here because session-numbering is sequenced when the work is actually picked up. Treat the order as a dependency graph: items higher on the list unblock items lower on the list.

1. **`lib/anthropic/` → `lib/llm/anthropic/` move + vendor-prefixed model ids.** Pure structural: directory move, dispatcher stub with a single `anthropic` case, model id migration in code (`pricing.ts`, runtime call sites) and in data (one-time SQL update on existing rows). No behavior change. Lands first because the prompt-caching and adapter work below builds on the new directory structure.

2. **Schema migration: agents extensions + `agent_attachments` + `message_attachments` + `formatted_outputs` + `usage_events` cache columns.** A single migration (or a small ordered pair) that adds every new column and table the architecture calls for. Storage buckets and policies land here too. RLS on every new table from the moment of creation.

3. **Agent CRUD UI.** The agent-creation form, the agent-edit form, the My Agents section on department pages, the fork-from-template action, and the soft-delete + 30-day-undo affordance. Templates rendered alongside My Agents per Section 2's IA. This is the biggest user-visible session in Phase 2.

4. **Test Smoke Agent retirement.** Once a real user-created native agent works end-to-end through (3), the seed at `supabase/seed/0003_test_native_agent.sql` is removed (or replaced with a no-op preserving the file's documentation comments for historical context). Single small commit; closes out the deferred 8a → 8c retirement note in D-023.

5. **Permanent attachments: upload, extraction, storage, send-to-model.** The user can attach files to an agent, files get text-extracted and cached, attachments enter the cached prompt portion sent to Anthropic. This is where the `agent-attachments` bucket and `agent_attachments` table get their first real exercise.

6. **Prompt caching wiring.** Cache markers on system prompt and attached references in the Anthropic adapter; cache token columns in `usage_events`; updated cost math in `pricing.ts`. Best landed alongside or immediately after (5), because (5) creates the content worth caching.

7. **Per-message file upload (Section 5a).** Paperclip in the chat input, `message-attachments` bucket and table exercised, extraction reused. Independent of (5) but probably easier after (5) because the extraction code path is already in place.

8. **Web search tool (Section 5b).** Tool plumbing in the Anthropic adapter; `tools_enabled` validation against the catalog; sources rendering in chat; search cost into `usage_events`.

9. **Word `.docx` export.** Server-side renderer; "Download as Word" button bound to `default_output_format = docx`; `formatted_outputs` audit row.

10. **Six Commercial templates conversion + Blank Agent template.** Convert the existing six external Commercial agents into native templates (`is_template = true`, system prompts authored or ported, tools and output format defaults set). Add the Blank Agent template. This is the moment Phase 2 has a real catalog instead of a Test Smoke Agent.

The order above is the recommended sequence. Some items can be parallelized (7 and 8 are independent of each other, both depend on 6); some cannot (3 must precede 5, 6, 7, 8, 9, 10 because they all need user-owned agents to exist). The ordering also leaves natural session-close points — after 4, the Test Smoke Agent is retired; after 6, caching is wired; after 9, the architecture's user-tunable surface is fully implemented.

Analytics promotion from localStorage to Supabase is a Phase 2 commitment from D-010 but is deliberately not part of this list — it is independent of agent runtime architecture and is tracked in `PROJECT_OUTLINE.md` as a separate Phase 2 work item.

---

## Deferred items

A consolidated list of everything the architecture explicitly defers, with brief notes on why and what triggers re-evaluation. This is the source of truth for "Phase 2 does not include X."

- **Agent versioning.** The naive worry — "edits break old conversations" — is solved by the existing per-conversation snapshots in `0004`. The harder worry — "what did this agent _used to_ look like across all its conversations" — requires a real `agent_versions` table and is not in v1. *Trigger:* a user complains they cannot see a prior version of an agent.

- **Agent sharing (peer-to-peer).** RLS in v1 is owner-only. The upgrade path is an `agent_shares` table (per-user explicit sharing) for the "give this agent to four named lawyers" case. *Trigger:* a user asks to give another specific user access to an agent.

- **Agent sharing (department-level).** A boolean or enum on `agents` that flips visibility to "all members of this department." Pairs with department-shared categories. *Trigger:* a department admin asks for a generic department-wide agent (e.g., "every M&A lawyer should see this NDA-review agent on their launchpad").

- **Department-shared categories.** Curated taxonomy visible to everyone in a department. Lands together with department-shared agents because the questions are the same shape. *Trigger:* same as department-shared agents.

- **User-creatable departments.** Departments are fixed-at-deploy data in v1, identical to Phase 1. *Trigger:* an org-admin asks for a department the system doesn't have.

- **Google Drive integration for attached references.** The schema's `source_type` column accepts `gdrive_link` as a future enum value; the adapter is a separate session because of the Google OAuth + Workspace API + format-handling cost. *Trigger:* a user asks to attach a Drive doc.

- **Native PDF / hybrid delivery (Path C).** V1 ships text extraction (Path B). The schema's `delivery_mode` column accepts `native_pdf` and `hybrid` as future enum values. *Trigger:* model fidelity loss on extracted text becomes a real complaint, e.g., on heavily-formatted documents where layout matters.

- **OCR for image-only PDFs.** No OCR in v1. *Trigger:* users start uploading scanned documents and the agent treats them as empty.

- **Audit-grade attachment preservation.** Conversations are pure history; attachment _contents_ are not preserved against later edits. The audit-grade alternative (snapshot every attachment into every conversation that uses it) is real cost and is deferred to Phase 7-ish. *Trigger:* a regulatory or evidentiary need to prove "this agent saw exactly this version of the playbook at this moment."

- **Agent icons / visual identity beyond name + description.** Decided against in Section 2. *Trigger:* a real UX gap surfaces from users; no current evidence of one.

- **Excel (`.xlsx`) export.** Deferred. *Trigger:* a user explicitly asks to export a structured table to Excel.

- **PowerPoint (`.pptx`) export.** Deferred. *Trigger:* a user asks for it; rare in legal work, so probably late.

- **Google Docs / Sheets / Slides export.** Deferred; each requires Google OAuth + Workspace API + format-specific generation. *Trigger:* a user asks to export to a Google Workspace format. Lands together if Drive integration lands first (shares the OAuth surface).

- **Configurable tools beyond on/off.** No per-tool config in v1 (no domain allowlists for web search, no per-search limits). *Trigger:* the second tool to ship; at that point a per-tool config shape becomes useful.

- **Calculator, calendar, Drive read/write, custom org tools.** The likely next configurable tools after web search; each is its own session. *Trigger:* the relevant user request, in any order.

- **Multi-vendor model support (OpenAI, Google, others).** The codebase is structured for multi-vendor from day one (`lib/llm/<vendor>/`, vendor-prefixed model ids, dispatcher with a single case in v1), but no second adapter ships in v1. *Trigger:* a real model-portfolio decision; until then, Anthropic-only is the right operational choice.

- **Multi-tenant org-shared agents.** Different tenants do not see each other's agents in any version of this product (per D-002, the multi-tenancy ceiling is "schema is multi-tenant ready," not "users from different orgs collaborate"). This is not "deferred" in the same sense — it is permanently out of scope for the launchpad framing.

---

## Cross-references

- **DECISION_LOG.md D-023** — Phase 2 runtime foundations (Session 8a). The SSE contract, cost tracking on every call, prompt-injection preamble, per-user rate limiting, and the `app/api/chat/route.ts` shape are unchanged; this document extends them.
- **DECISION_LOG.md D-025** — the scope expansion ADR that points at this document as the spec.
- **CLAUDE.md "AI Integration Rules"** — the security non-negotiables this architecture honors (server-only API keys, system prompts in DB not code, model output sanitized, cost tracking, rate limiting, conversation scoping).
- **CLAUDE.md "Security Non-Negotiables"** — RLS on every table, role checks on every sensitive server action, no PII in logs.
- **`supabase/migrations/0001_initial_schema.sql`** — `agents` table, including the existing `created_by` column the architecture reuses.
- **`supabase/migrations/0004_native_agents.sql`** — `conversations`, `messages`, `usage_events`, including `system_prompt_snapshot` and `model_snapshot` that make versioning-deferral safe.
- **`lib/anthropic/`** — current vendor-scoped runtime; moves to `lib/llm/anthropic/` per Section 6.
- **`PROJECT_OUTLINE.md`** — Phase 2 framing; reorganized in this session to mirror the implementation phasing list above.
