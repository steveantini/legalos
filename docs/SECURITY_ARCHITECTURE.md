# legalOS — Security Architecture & Trust Narrative

This is the organized, accurate **source** for the platform's trust story: the
canonical home a future landing page, trust center, security questionnaire, or
decision-maker conversation draws from. It is **not** marketing copy. Each entry
is a trust **claim** (plain language a general counsel or security reviewer
understands) paired with its **architectural basis** (what in the system makes
the claim true, and where it lives).

legalOS handles attorney work product and, in some deployments, privileged or
confidential information. The guiding principle below is therefore not optional
polish — it is how the product earns the right to hold that data.

## Standing principle: design every decision to be cleanly articulable

At every governance or security fork, legalOS leans to the option that is the
more **explainable** — the one where the guarantee is enforced in the
architecture and can be stated plainly, rather than relying on guidance,
convention, or trust in good behavior. A claim that reads "the system cannot do
X" is worth more to a legal buyer than "we recommend against X."

This document is the **living source** for that narrative. When a new
trust-relevant decision ships, its claim + architectural basis is added here, so
the story stays current and accurate as the product grows.

---

## The trust claims

### 1. Least-privilege role model, enforced in three layers

**Claim.** Administrative privilege cannot be escalated by the person holding it.
An organization admin can manage regular and organization-admin roles only — they
cannot create or modify a super admin. No one can remove the organization's last
super admin, so the organization can never be locked out of its own governance.

**Architectural basis.** The rule is enforced in three independent layers: an
honest UI that only offers permitted changes, a server action that re-checks the
actor's authority, and a database trigger that is the final authority — it
rejects an illegal role change even if it arrives as direct SQL, bypassing the
application entirely. Separation of duties (org admins cannot mint super admins)
and last-super-admin protection live in that trigger. (DECISION_LOG D-079.)

### 2. Soft-deactivation over hard-deletion

**Claim.** Removing a person's access is reversible and destroys nothing. A
deactivated user loses access immediately, but their agents, connections, and
history remain intact and return if they are reactivated.

**Architectural basis.** Deactivation flips a single load-bearing flag; access is
cut off at the request layer (the proxy chokepoint blocks a deactivated user on
their next request, across pages, APIs, and actions, and the auth callback
rejects new sessions). Nothing is deleted, so reactivation is lossless. The same
least-privilege rules apply (an org admin cannot deactivate a super admin; the
last active super admin cannot be deactivated), and every activation and
deactivation is recorded for audit. (DECISION_LOG D-080.)

### 3. Encrypted credential isolation

**Claim.** Every secret the platform holds on a customer's behalf — OAuth tokens
for connected data sources, and model-provider API keys — is encrypted at rest,
reachable only by the server, never placed in the model's context, never returned
to the browser, and never logged.

**Architectural basis.** Secrets are encrypted with AES-256-GCM at the
application layer and stored in a dedicated table whose row-level security is
enabled **and forced with no policies**, so the only path that can read it is the
server-side service-role client; every other role is denied, including the table
owner. The encryption key is a server-only environment variable, never in the
database. Raw secrets are never written to logs (only non-identifying error
codes). (Connector arc; bring-your-own-key, D-087.)

### 4. Per-organization bring-your-own-key model credentials

**Claim.** An organization can supply its own model-provider API key; the
platform then runs that organization's agents on that key instead of the managed
default. The key is checked before it is saved, stored encrypted, shown
afterward only as a masked hint, and the organization can switch between its own
key and the managed default at any time without losing it.

**Architectural basis.** A bring-your-own key is validated against the provider
(a cheap live auth check) **before** anything is stored, so a bad key is never
saved. It is encrypted into the same service-role-only secret store as OAuth
tokens, and only a masked hint (the last four characters) is ever retained for
display — the key itself is write-only in the UI and never re-shown. The chat
route resolves the credential per organization at call time, so one
organization's key can never serve another. Switching between managed and
bring-your-own is non-destructive in both directions. This is the foundation for
per-organization credential isolation and for the eventual data-sovereignty story
(claim 10). (DECISION_LOG D-086, D-087, D-088.)

### 5. Three-layer enforcement on sensitive mutations

**Claim.** The most sensitive changes are guarded in depth, so a compromised
front end is not enough to make an illegitimate change.

**Architectural basis.** Sensitive mutations (role changes, deactivation, policy
edits, credential changes) follow the same pattern: the UI only offers what is
permitted (honest UX), the server action re-verifies the actor's authority (UX is
not security), and the database — through a trigger or row-level-security policy
— is the final authority that holds even against direct SQL. The database, not
the client, is the last line of defense. (DECISION_LOG D-079, D-080; mirror-RLS,
D-041.)

### 6. A full audit trail of privileged actions

**Claim.** Privileged changes to people and access are recorded and visible. An
administrator can see, in one place, who changed whose role (and from what to
what) and who deactivated or reactivated whom.

**Architectural basis.** The audit records are written by the same database
triggers that enforce the rules, so the trail cannot be sidestepped by the
application — a change that happens is a change that is recorded, including
changes made directly in the database (shown honestly as system changes). The
records are append-only and surfaced read-only in the admin audit log. Coverage
expands over time; the recording mechanism is trigger-authoritative from the
start. (DECISION_LOG D-083; audit-log viewer, A6.)

### 7. Notify-and-approve governance

**Claim.** Nothing that changes what an organization's agents can do or reach is
enabled silently. The authority that owns a decision approves it; the authority
always matches ownership.

**Architectural basis.** The connection and content model is built so the owning
authority governs its own surface: an organization's super admin governs what is
enabled for that organization (connection policy, the model connection, allowed
categories), while legalOS governs what it owns and offers. Upstream changes are
detected and surfaced for explicit approval rather than auto-applied — the shape
is detect, the owner reviews, an explicit apply, audited, never automatic.
(Connections-phase design; ROADMAP.)

These governance surfaces are scoped per organization at the database layer.
`connection_policy` and `connections` (including any bring-your-own model key)
each carry an `organization_id`; row-level security confines every read and write
to the caller's own organization, and the service-role model-credential resolver
filters by organization, so one organization's super admin cannot change another
organization's connector governance or route another organization's inference. An
earlier single-tenant build had these as a global policy row and a globally
resolved key; the per-organization scoping closed that gap when the second tenant
(the Demo Org) went live. (DECISION_LOG D-136; migration 0066.)

### 8. Honest-state UI

**Claim.** The product tells the truth about its own state. A feature that is
coming is labeled coming, not faked; a number that is measured is distinguished
from a number that is modeled or sampled.

**Architectural basis.** Coming-soon surfaces are rendered as honest, inert
coming-soon states rather than fake-interactive controls; measured data
(Insights, drawn from the real usage ledger) is visibly separated from
sample/demo data; placeholder values are marked as placeholders, never presented
as verified. This is a standing implementation principle across the product, not
a one-time choice. (Standing principle; Insights A4a; the model-connector and
MCP coming-soon treatments.)

### 9. The MCP trusted-only boundary (the centerpiece)

**Claim.** legalOS supports MCP (the Model Context Protocol, the emerging open
standard for connecting AI to tools and data), but **only** first-party official
servers on a built-in allowlist, or servers the customer hosts themselves, can
ever connect. Arbitrary third-party or community MCP servers cannot connect to a
customer's data — not "are discouraged from connecting," but **cannot**. This is
a guarantee enforced in the architecture, not a recommendation.

**Architectural basis.** The trusted-server boundary is established as code before
any connect capability exists (the guarantee precedes the capability). A
code-level trusted-MCP registry is the **hard ceiling** on which servers are
connectable: only a server registered there (first-party), or a customer-supplied
endpoint connected through a separate, partitioned self-hosted path, is
connectable. Crucially, **trust is derived from the code registry, never stored
as authority** — a server's trust tier is recomputed from the registry on every
check, never read as truth from a database row, so no row, no admin action, no
API input, and no forged request can make an untrusted server appear trusted.
Untrusted servers are not blocked; they are **unrepresentable as connectable**.
The code allowlist changes only by a deliberate, reviewed deploy; an
organization's own policy can only **narrow** that set (choose a subset), never
widen it. The connect flow enforces the check at both initiate and callback
(defense in depth). The allowlist also holds only **real, official endpoints
sourced from the vendor's own documentation** (e.g. Google's Workspace MCP servers
from Google's own console, not the open web where community Workspace servers
dominate); servers the vendor does not actually offer are not listed at all, so
the allowlist stays an accurate map of vetted, existing servers. (Why this
matters: MCP's security maturity lags its adoption; many community servers carry
known vulnerabilities and tool-poisoning risk — the boundary is what makes MCP
safe to offer to holders of privileged legal data.)
(DECISION_LOG D-089, flag 2a.)

There are exactly two trusted tiers, and they are **partitioned in code** so neither
can be mistaken for the other: a first-party server (a code-registry entry) and a
**self-hosted** server (a customer-supplied URL the organization runs, trusted
because the customer owns the infrastructure, super-admin-authorized). The two use
disjoint server-id namespaces (a registry id vs a reserved `self-hosted:<origin>`
id), the tier marker rides inside the **signed, tamper-proof** state, and trust is
**derived** on every check (registry membership wins; otherwise the self-hosted
path yields the self-hosted tier; otherwise untrusted). So a tamperer cannot flip a
self-hosted flow to first-party, an untrusted URL has no first-party entry and via
the self-hosted path only ever becomes self-hosted under super-admin authority, and
no unknown server becomes connectable. (DECISION_LOG D-093, flag 2b-ii-3.)

This posture is now **user-visible** in the product: the admin connector surface
offers only the vetted first-party servers and a "connect your own self-hosted
server" path, with each connected server's trust level shown plainly and no
affordance anywhere to add an arbitrary server. The guarantee is legible in the
UI itself, not just enforced in the backend. (DECISION_LOG D-095, flag 2c.)

### 9a. MCP credential custody (the protocol library never holds your credentials)

**Claim.** When legalOS connects to a trusted MCP server, it authenticates using
the open OAuth 2.1 standard, but it keeps custody of every credential itself: the
access token and the client registration are stored in legalOS's own encrypted,
service-role-only vault, refreshed and revocable through legalOS's own path. The
MCP protocol library performs the protocol; it never holds your credentials.

**Architectural basis.** The MCP SDK is used purely as a protocol library: its
discrete OAuth 2.1 step-functions (authorization-server discovery, dynamic client
registration, authorization, token exchange, refresh) each return their secret to
legalOS, which encrypts and stores it in the same AES-256-GCM, service-role-only
`connection_secrets` substrate as every other credential (claim 3) — the SDK
never persists a token. Discovery resolves the real endpoints (rather than
hard-coding them), the trusted-server allowlist is enforced at both the start and
the completion of the flow (claim 9), and refresh runs through legalOS's own
token path, so credentials remain governed and revocable. The audience-binding
seam (RFC 8707 resource indicators) is in place for a future model where tokens
come from the customer's own identity provider, bound to a single server.
(DECISION_LOG D-092, flag 2b-ii-2.)

Custody is identical whether the OAuth client is registered dynamically or
pre-registered: some trusted servers (e.g. Google) do not support dynamic client
registration and instead use a client provisioned out of band, whose id and
secret legalOS reads from a dedicated, server-only configuration value distinct
from any data-source connector's. That configured secret is treated as a
credential like any other — sealed into the connect flow and stored in the same
AES-256-GCM, service-role-only vault, never in code and never client-reachable —
so the "the protocol library never holds your credentials" guarantee holds for
both acquisition modes. (DECISION_LOG D-097.)

### 10. The data-sovereignty story

**Claim.** An organization can run legalOS so that its privileged data never
leaves its own environment: its own model (a self-hosted, open-weight model
behind its own endpoint) and its own tool/data servers (self-hosted MCP
endpoints), with legalOS as the orchestration layer rather than a place the data
must reside.

**Architectural basis.** Two orthogonal axes make this possible. On the model
axis, the bring-your-own-key/self-hosted model connection (claim 4) lets an
organization point inference at a model it runs, with a configurable endpoint,
its key encrypted and isolated. On the tool axis, the MCP trusted-only boundary
(claim 9) includes the self-hosted path, so an organization can connect MCP
servers it operates. Combined — own model plus own servers — privileged data can
stay inside the customer's environment end to end. This is a forward-looking
claim assembled from shipped foundations; the self-hosted surfaces finalize as
those connectors ship. (Claims 4 and 9; Connections-phase design.)

---

## How to use this document

- **Source, not copy.** The content phase (landing page, trust center) rewrites
  these claims into audience-appropriate copy; this file stays the accurate
  source of record. Do not let the marketing copy drift from the architectural
  basis here.
- **Keep it current.** When a trust-relevant decision ships, add or update its
  claim + basis here in the same change, and cross-reference the DECISION_LOG
  entry. The ROADMAP's security-transparency lens points to this document as the
  canonical home rather than duplicating the narrative.
