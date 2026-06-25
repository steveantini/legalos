# Changing the product name or domain

The product name ("legalOS") and the domain (currently
`legal-operating-system.vercel.app`) are placeholders; a real name and domain
will come later. This is the runbook for that rebrand.

The name and the domain are independent, and neither is baked into the
architecture. As of the brand-decoupling arc (D-182, D-183), the product display
name has a single source of truth and the built-in agent tier carries no brand in
its data, so a name change is a small, ordered, low-risk procedure with **zero
data migration**.

## Single source of truth (read this first)

`siteConfig.siteTitle` in `config/site.ts` is the one place the product display
name is defined. It is surfaced two ways from `components/brand/wordmark.tsx`:

- `<Wordmark/>`, the display component. Renders `siteConfig.siteTitle` and
  preserves its canonical casing even inside an uppercased container (inline
  `text-transform: none`), so the wordmark never flattens to "LEGALOS" in an
  eyebrow or all-caps heading.
- `PRODUCT_NAME`, the same string, for contexts that need a string not a node
  (the document `<title>`, export metadata, server-side messages).

Editing `siteConfig.siteTitle` renames every STRUCTURAL wordmark at once: the
rails (workspace / admin / platform / settings), the landing topbar / footer /
hero, the marketing page header, the document `<title>`, the built-in agent tier
label and subline, the agent lock message and form banner / hint, and the docx
export headers.

## Product name change: the procedure (in this order)

1. **Edit `siteConfig.siteTitle`** in `config/site.ts`. This covers every
   structural wordmark automatically (see the list above). No other code edit is
   required for the structural marks.

2. **Review and edit the inline PROSE** that interpolates the name mid-sentence.
   This prose is deliberately NOT centralized (it reads better as literals and
   deserves a human pass at rename time, not a blind find/replace). It lives in:
   - `app/(marketing)/*`, the marketing pages (about, mission, trust, legal,
     faq, pricing, support, contact, documentation).
   - `components/landing/landing-hero.tsx`, the "Welcome to legalOS" headline.
   - `lib/marketing/documentation.tsx`, the in-product documentation body copy.
   - `lib/support/assistant.ts`, the support assistant copy.
   - `README.md` and `docs/FEATURES_CLAIMS.md`.

   Scale: roughly 186 user-facing prose / doc occurrences across these surfaces
   (from the name inventory). This is the bulk of the work, and it is a review,
   not a mechanical replace.

3. **Data: nothing.** The built-in agent tier was decoupled from the brand
   (D-182): its `source_origin` and slugs use the neutral `builtin` token
   (`builtin:tools/<skill>`, `builtin-<skill>`), not the product name. No row,
   slug, or `source_origin` references the brand, so a rename needs no data
   migration and no DB change at all. (This is the key correction over the prior
   version of this doc, which predated the built-in tier and was briefly wrong
   about data.)

## Deliberately EXCLUDED from a rename (do NOT change these)

These contain the legacy `legalos` token but are FUNCTIONAL IDENTIFIERS whose
value is stability, not branding. Changing them breaks things. Leave them exactly
as they are at rename time:

- `legalos_oauth_state` and `legalos_mcp_oauth_state` cookies, and the HMAC
  domain-separation string `"legalos:connection-oauth-state"`
  (`lib/connections/crypto.ts`), renaming breaks validation of any in-flight
  OAuth flow.
- The chat draft `localStorage` key `legalos.draft.<id>`
  (`components/chat/chat-interface.tsx`), renaming orphans every user's unsent
  draft.
- The demo synthetic-email domain `legalos-internal.invalid`
  (`lib/demo/token.ts`), it is baked into existing demo user email addresses.
- `package.json` `"name": "legalos"`, an internal npm package id, not displayed.
- The MCP client identity (`lib/connections/mcp/client.ts`) already derives from
  `siteConfig.siteTitle`, so it renames automatically. Nothing to do.

## Separate OPS items (decided at actual rename, not part of the code change)

- **Support email domain.** `siteConfig.adminEmail` (`legalos.io`) is shown on
  support / help surfaces. Changing it is a real-email / DNS decision, not a code
  rename step. Flagged here so it is not forgotten.
- **Deployment domains.** The `*.vercel.app` aliases (and any future custom
  domain). See the "Domain change" section below; an external / ops task.

## How this was verified

A dummy-`siteTitle` propagation check: set `siteConfig.siteTitle` to a test value
and confirm the structural marks follow (the Wordmark, the built-in tier label
and subline) while the functional identifiers and the inline prose do NOT move
(they read no config). This is captured as a regression test in
`components/brand/wordmark.test.ts`.

## Domain change (e.g. `legal-operating-system.vercel.app` to a real domain)

1. **Code:** set `NEXT_PUBLIC_SITE_URL` to the new domain (in Vercel env). The app
   constructs all its URLs from this via `resolveAppBaseUrl()`
   (`lib/connections/base-url.ts`), so this single env var updates every generated
   URL (including the OAuth callback URLs). There are no hardcoded domain
   references to hunt down.
2. **External OAuth redirect URIs (the one step that cannot be skipped):** each
   external provider whitelists the EXACT callback URL, so each must be updated to
   the new domain in that provider's console:
   - **Google Cloud OAuth client for the data-source Drive connector** (the
     `GOOGLE_OAUTH_CLIENT_ID` client): update its authorized redirect URI to the
     new domain's data-source callback (`/api/connections/callback`).
   - **Google Cloud OAuth client for MCP** (the `GOOGLE_MCP_OAUTH_CLIENT_ID`
     client): update its authorized redirect URI to the new domain's MCP callback
     (`/api/connections/mcp/callback`).
   - **Any future provider's OAuth client:** same, update its registered redirect
     URI to the new domain's relevant callback.
3. **Verify** `NEXT_PUBLIC_SITE_URL` is set per Vercel environment as intended
   (production points at the real domain; the code deliberately does not fall back
   to per-deploy `VERCEL_URL`, so preview deploys won't match registered redirect
   URIs, which is expected).
4. **Existing connections:** encrypted secrets and connection rows are unaffected
   by a domain change (they don't store the domain). Only NEW auth flows use the
   new redirect URI; if a provider strictly validates the redirect on refresh,
   re-connect if needed, but token storage itself is domain-agnostic.

## Effort

- Name change = one `siteConfig.siteTitle` edit (structural marks) + a prose
  review (~186 occurrences) + zero data.
- Domain change = one env var + updating redirect URIs in the (currently one or
  two) external OAuth consoles.

No rebuild concerns, no migration, no schema / secret impact.

## Tip

Pick the real name / domain before doing many external OAuth registrations, so
redirect URIs are registered once against the real domain rather than
re-registered later. A minor convenience, not a blocker (re-registering a redirect
URI is trivial).
