# Changing the product name or domain

The product name ("legalOS") and the domain (currently
`legal-operating-system.vercel.app`) are placeholders; a real name and domain will
come later. This is the procedure for that rebrand.

The product name and the domain are independent, and neither is baked into the
architecture. The database, connections, encrypted secrets, trust registry, and
auth flows do not reference the name or domain. A rebrand is a bounded, low-risk
procedure.

## Product name change (e.g. "legalOS" → a new name)

- A find-and-replace across **user-facing display text** (UI copy, page titles,
  doc references). No architectural change; nothing functional depends on the
  name.
- Check: UI components/strings, page metadata/titles, email/notification copy if
  any, and docs. The name is a label, not a dependency.

## Domain change (e.g. `legal-operating-system.vercel.app` → a real domain)

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
   - **Any future provider's OAuth client:** same — update its registered redirect
     URI to the new domain's relevant callback.
3. **Verify** `NEXT_PUBLIC_SITE_URL` is set per Vercel environment as intended
   (production points at the real domain; the code deliberately does not fall back
   to per-deploy `VERCEL_URL`, so preview deploys won't match registered redirect
   URIs — expected).
4. **Existing connections:** encrypted secrets and connection rows are unaffected
   by a domain change (they don't store the domain). Only NEW auth flows use the
   new redirect URI; if a provider strictly validates the redirect on refresh,
   re-connect if needed, but token storage itself is domain-agnostic.

## Effort

- Name change = display-text find/replace.
- Domain change = one env var + updating redirect URIs in the (currently one or
  two) external OAuth consoles.

No rebuild, no migration, no schema/secret impact.

## Tip

Pick the real name/domain before doing many external OAuth registrations, so
redirect URIs are registered once against the real domain rather than re-registered
later — a minor convenience, not a blocker (re-registering a redirect URI is
trivial).
