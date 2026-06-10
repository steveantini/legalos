# Setup Guide

This guide walks you from an empty machine to a running local dev environment for legalOS, and then through deploying your own instance to Vercel.

Estimated time: **30–45 minutes** the first time through.

---

## Prerequisites

Before you start, install these:

| Tool | Version | How to check |
|---|---|---|
| Node.js | 20.x or later (LTS recommended) | `node --version` |
| npm | 10.x or later | `npm --version` |
| git | any recent version | `git --version` |
| A code editor | VS Code recommended | — |

Accounts you'll need:

| Service | Why | Cost |
|---|---|---|
| [GitHub](https://github.com) | Repo hosting | Free |
| [Vercel](https://vercel.com) | App hosting | Free tier is sufficient |
| [Supabase](https://supabase.com) | Database + auth | Free tier is sufficient |
| [Anthropic](https://console.anthropic.com) | Claude API (needed from Phase 2 onward) | Pay-as-you-go; Phase 0–1 can skip this |

---

## Part 1 — Fork or clone the repo

### If you are the project owner (first-time setup)

```bash
# Create the repo on GitHub first, then:
git clone git@github.com:<your-username>/legalos.git
cd legalos
```

### If you are forking the template for your own legal department

1. On GitHub, click **Use this template** on the repo page and create a new repo under your account or org.
2. Clone your new repo locally:

```bash
git clone git@github.com:<your-org>/<your-repo-name>.git
cd <your-repo-name>
```

3. Customize the branding and department list — see [Part 5 — Customization](#part-5--customization).

---

## Part 2 — Install and run locally

```bash
# Install dependencies
npm install

# Copy the env template (you'll fill it in next)
cp .env.example .env.local
```

Leave `.env.local` with placeholder values for now. The app won't connect to Supabase or Anthropic yet, but the Next.js dev server will boot.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the landing page. Auth and real data won't work until Supabase is configured in Part 3.

---

## Part 3 — Set up Supabase

### 3a. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**.
2. Name it something like `legal-launchpad-dev`.
   (If you're setting this up directly for production with no local dev,
   name it `legal-launchpad-prod` instead and follow the production-only
   notes in 3f and Part 4.)
3. Pick a region close to you and set a strong database password (save it in a password manager).
4. Wait for the project to provision (~2 minutes).

### 3b. Grab your credentials

In the Supabase dashboard, go to **Project Settings → API**. Copy these three values:

| Value | Where it lives |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` secret key | `SUPABASE_SERVICE_ROLE_KEY` |

The `service_role` key bypasses Row-Level Security. **Never** put it in a client component, never prefix it with `NEXT_PUBLIC_`, and never commit it.

### 3c. Paste them into `.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### 3d. Apply the migrations

Apply **every** migration in `supabase/migrations/`, in filename order (`0001_initial_schema.sql` through the latest), each as a separate query in the Supabase dashboard → **SQL Editor**. The migrations are append-only and ordered; applying only the first leaves you with a first-phase schema that is missing chat, the agents runtime, attachments, connections, the admin area, workflows, and demo access. The repo is intentionally unlinked from the Supabase CLI, so apply them by hand in the dashboard (never `supabase db push`).

After `0001`, you should see the core tables created (`organizations`, `users`, `departments`, `user_department_roles`, `agents`); the later migrations add many more (conversations, messages, usage_events, attachments, connections, workflow tables, the demo tables, and so on).

Every table has RLS enabled and policies in place. Verify this in **Authentication → Policies** — every table should show at least one policy (the encrypted-secrets tables are intentionally policy-less and force-RLS, reachable only by the service role).

### 3e. Enable magic link auth

In the Supabase dashboard:
1. Go to **Authentication → Providers**.
2. Confirm **Email** is enabled (it is by default).
3. Under **Email templates**, review the magic link template. Customize the subject and sender name to match your branding later.
4. Under **URL Configuration**, set:
   - **Site URL:** `http://localhost:3000` for local dev.
   - **Redirect URLs:** add `http://localhost:3000/**`.

   This is **Stage 1** of a two-stage URL Configuration. Stage 2 in
   Part 4 will add the production Vercel URL once you have one — you
   can't fill it in until after the first deploy gives you a URL.

### 3f. Seed your organization, departments, agents, and admin user

Use the project's maintained seed files in `supabase/seed/` rather than hand-written SQL, since they are the source of truth for the current organization, department set, and baseline agents, and they stay in sync as the schema evolves. Run them in the **SQL Editor** in this order:

1. **Sign in once first**, so your `auth.users` row exists (the org seed promotes that user to admin and will raise an error if it can't find them):
   - Start the dev server: `npm run dev`.
   - Go to `http://localhost:3000/login` and sign in with email + magic link; click the link to land authenticated.
2. **Run `supabase/seed/0001_org_and_departments.sql`.** First replace `ADMIN_EMAIL_REPLACE_ME` at the top with the email you just signed in with. This creates the organization ("Your Company, Inc."), its current department set, promotes your user to `org_admin`, and grants you `dept_admin` on every department. It is idempotent (safe to re-run).
3. **Run `supabase/seed/0002_commercial_agents.sql`** to seed the baseline Commercial agents.

Refresh the app. You should now see the admin nav and the seeded departments. (The department set is whatever the seed creates; do not hand-maintain a separate list. The current product taxonomy is described in `PROJECT_OUTLINE.md`.)

#### Alternative: production-only setup (no local dev)

If this Supabase project is your **production** project and you don't want
to spin up local dev just to create the first user, create the auth user
directly in the dashboard:

1. In Supabase, go to **Authentication → Users → Add user → Create new
   user**. Enter the admin email. You can either set a temporary password
   or leave "Auto confirm user" checked and rely on magic-link sign-in
   later.
2. Run `supabase/seed/0001_org_and_departments.sql` against the prod
   project, with `ADMIN_EMAIL_REPLACE_ME` set to the email you just
   created. It seeds the organization and departments and promotes that
   user (it joins on `auth.users` by email, so the user from step 1 is
   picked up). Then run `supabase/seed/0002_commercial_agents.sql`.
3. The seeded `public.users` row remains intact; the RPC's idempotent
   guard means first sign-in is a no-op for the admin user. (For
   non-admin users created later via magic-link signup, the RPC creates
   their `public.users` row on first sign-in.)

This is the path Session 7 used for the production deploy. The dev-signup
path above remains the recommended flow for the dev project.

### 3g. Configure custom SMTP via Resend (sandbox mode)

Supabase's default email provider caps at 2/hour on the free tier, which blocks smoke-testing of magic-link flows. Configuring custom SMTP via Resend lifts this cap. This subsection sets it up in **sandbox mode** — no verified custom domain — which is enough to validate the rate-limit fix end-to-end with a single recipient (your own Resend account email). Broader-cohort delivery requires a verified custom domain with SPF, DKIM, and DMARC DNS records, deferred pending the subdomain-split decision in D-036.

#### Resend account setup

1. Sign up at [resend.com](https://resend.com) using the email that will receive the smoke-test magic links.
2. Click the confirmation link Resend emails you. This both activates the account and verifies that address as the only allowed sandbox recipient (see below).
3. At [resend.com/api-keys](https://resend.com/api-keys), create a new API key with full sending permission. Save it — this is the value you'll paste as the SMTP password in Supabase.

#### Sandbox mode constraint

In sandbox mode the only address that can receive email is the one used to create the Resend account. Sends to any other address fail with a `403`, visible in Resend's email log at [resend.com/emails](https://resend.com/emails). The 403 is not surfaced in Supabase's UI, so when delivery seems missing, Resend's log is the source of truth. There is no "verified recipients" list to manage — the single allowed recipient is fixed at account signup, and broadening it requires the verified-custom-domain path (see the closing note in this subsection).

#### Supabase custom SMTP configuration

In the Supabase dashboard, go to **Authentication → SMTP Settings** (URL: `/dashboard/project/_/auth/smtp`). Enable the custom-SMTP toggle if there is one, then fill in:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | The Resend API key from the step above |
| Sender email | `onboarding@resend.dev` |
| Sender name | `legalOS` |
| Encryption | SSL/TLS (port 465 is SMTPS — immediate TLS, not STARTTLS) |

UI labels in Supabase's dashboard may differ slightly from the names in this table. Supabase documents the underlying API parameter names but not the UI labels, and the dashboard surface drifts; match by purpose if a label doesn't exactly correspond.

#### Smoke test

The point of this subsection is verifying the 2/hour rate-limit cap is gone. Without this step, the SMTP config isn't proven.

1. Trigger a magic link from `/login` (production or a preview deploy) using your Resend account email.
2. Confirm the email arrives.
3. Inspect the email's headers — the sender domain should be `resend.com` (delivered via Resend), not Supabase's default sender.
4. Trigger 3+ sends to the same address within one hour. All should land. This proves the 2/hour default cap is no longer in effect.

Note: Supabase imposes a separate 30/hour rate limit on newly configured custom SMTP servers, adjustable at `/dashboard/project/_/auth/rate-limits`. That's plenty of headroom for solo smoke-testing, but worth knowing if you later load-test the magic-link flow.

#### Looking ahead

Two things remain blocked on a future custom-domain decision: (a) broader-cohort delivery — anyone other than the Resend account owner — which requires DNS authentication via SPF, DKIM, and DMARC records on a verified custom domain, and (b) per-environment credential separation, where dev, preview, and prod could share one Resend account or split into separate ones. Both unlock once the subdomain-split question from D-036 is answered.

---

## Part 4 — Deploy to Vercel

### 4a. Push to GitHub

```bash
git add .
git commit -m "chore: initial setup"
git push origin main
```

### 4b. Connect Vercel to your repo

1. Go to [vercel.com/new](https://vercel.com/new).
2. Click **Import** next to your GitHub repo.
3. Vercel will auto-detect Next.js. Leave the build settings at their defaults.

### 4c. Add environment variables in Vercel

In the Vercel project → **Settings → Environment Variables**, add:

| Variable | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Production, Preview only (NOT Development) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (Phase 2+) | Production, Preview only |
| `NEXT_PUBLIC_SITE_URL` | Your Vercel **production** URL (set in Stage 2 — see 4e) | Production only |

Important:
- **No client-side variable** should ever hold the Anthropic API key or the Supabase service role key. If you see `NEXT_PUBLIC_ANTHROPIC_...` or `NEXT_PUBLIC_SUPABASE_SERVICE_...` anywhere, stop and fix it.
- Use a **separate Supabase project** for production if you want isolation between environments. For an early-stage Phase 0/1 demo a single project is fine — and that is the default this template assumes: **all three Vercel environments (Production, Preview, Development) share the same Supabase project**. If you provision a second project for prod, repeat 3a–3f against it (using the dashboard add-user path in 3f).

**Chicken-and-egg note on `NEXT_PUBLIC_SITE_URL`.** You can't set this until Vercel gives you a production URL, which doesn't exist until the first deploy. So:

1. Skip `NEXT_PUBLIC_SITE_URL` during the first import — leave it unset.
2. Trigger the first deploy (4e).
3. Copy the production URL Vercel assigns and come back to set `NEXT_PUBLIC_SITE_URL` (then redeploy — env var changes don't apply until the next build).

**Preview deploys don't need a per-branch URL env var.** The login server action resolves the magic-link redirect base URL with this fallback chain:

1. `NEXT_PUBLIC_SITE_URL` (Production only, after Stage 2)
2. `VERCEL_URL` — auto-injected by Vercel on every runtime, including every preview deploy. Unique per deploy. Server-only (never `NEXT_PUBLIC_`).
3. `http://localhost:3000` (local dev)

You don't need to set `VERCEL_URL` anywhere — Vercel injects it automatically. This is what makes preview branches self-test magic-link login without hardcoding URLs. See `app/(public)/login/actions.ts` for the resolution logic.

### 4d. Stage 2 of URL Configuration

After the first deploy (4e) gives you a production URL, come back to Supabase → **Authentication → URL Configuration** and complete Stage 2:

1. Update **Site URL** from `http://localhost:3000` to your production Vercel URL (e.g., `https://your-app.vercel.app`).
2. Add to **Redirect URLs**:

   ```
   https://your-app.vercel.app/**
   https://your-app-*.vercel.app/**
   ```

   Keep the existing `http://localhost:3000/**` entry for local dev.

The first pattern covers production. The second covers preview deploys (each preview gets a unique subdomain). Without the wildcard pattern, magic-link clicks from preview deploys will redirect-loop back to login.

### 4e. First deploy

Vercel deploys automatically on the first import. If you imported without pushing first, push a small change or click **Deploy** in the Vercel dashboard.

When the build finishes, copy the production URL Vercel assigns (e.g., `https://your-app.vercel.app`).

### 4f. Set `NEXT_PUBLIC_SITE_URL` and redeploy

1. Vercel → **Settings → Environment Variables** → add `NEXT_PUBLIC_SITE_URL` (Production scope) with the URL from 4e.
2. Complete Stage 2 of Supabase URL Configuration (4d).
3. Trigger a redeploy — env var changes don't take effect until the next build. Push any small change to `main`, or use **Deployments → … → Redeploy** in the Vercel dashboard.

Once the redeploy finishes, open your Vercel URL. Magic-link login should now redirect to your production domain (not `localhost:3000`), and you should see the same admin experience as on local dev.

---

## Part 5 — Customization

All branding and theme settings live in `config/site.ts` and `config/theme.ts`. Department seed data lives in the Supabase `departments` table (see 3f above).

### Branding

Edit `config/site.ts`:

```typescript
export const siteConfig = {
  companyName: "Your Company, Inc.",
  siteTitle: "legalOS",
  departmentName: "Legal",
  themePreset: "carbon",  // "carbon" | "modern" | "minimal" | "custom"
  adminEmail: "legal-ops@yourcompany.com",
};
```

### Theme

The template ships with three presets: Carbon (IBM-inspired, `#0f62fe`), Modern (indigo, `#6366f1`), and Minimal (monochrome, `#18181b`). Pick one in `siteConfig.themePreset`, or choose `"custom"` and override the tokens in `config/theme.ts`.

### Departments

Departments are database rows, not code. To add a new department:

1. Insert a row into the `departments` table (see `supabase/seed/0001_org_and_departments.sql` for the pattern, and the migrations that evolved the set).
2. That's it. The app picks it up on next page load.

To remove a department, soft-delete it by setting `deleted_at` (the read paths filter on `deleted_at IS NULL`). Do not hard-delete, since existing agents and usage events reference it.

### Agents

Agents can be created and edited in-app today (users fork and own My agents; admins manage Approved agents). You can also seed agents directly in SQL, which is how the baseline Commercial agents and the Claude for Legal imports are provisioned:

```sql
insert into agents (
  organization_id, department_id, slug, name, description, type,
  external_url, system_prompt, model, is_active
) values (
  'ORG_ID',
  (select id from departments where slug = 'commercial' and organization_id = 'ORG_ID'),
  'gemini-contract-review',
  'Gemini Contract Review',
  'Google Gemini Gem for contract review.',
  'external',
  'https://gemini.google.com/gem/your-gem-id',
  null,
  null,
  true
);
```

For a native agent, set `type = 'native'`, leave `external_url` null, and populate `system_prompt` and `model` (e.g., `'claude-opus-4-7'`).

---

## Troubleshooting

**Login works but I can't see any departments after logging in.**
Check the `user_department_roles` table. Your user needs at least one row per department they should see. The org seed (`supabase/seed/0001_org_and_departments.sql`, run in 3f) grants the admin user access to every department.

**"Could not find the function public.xyz" or missing table errors.**
A migration didn't run cleanly, or not all migrations were applied. Confirm every file in `supabase/migrations/` has been run in order, and re-run any that errored. Check the query log for errors.

**RLS policy is blocking me from seeing my own data.**
This is the policies doing their job, but wrong. Check that your user row exists in `public.users` (not just `auth.users`) with the correct `organization_id` and `role`. The seed block in 3f handles this.

**Vercel build fails on TypeScript errors.**
Run `npm run build` locally first to catch them. TypeScript errors fail the Vercel build on purpose — this is a feature, not a bug.

**Anthropic calls return 401.**
Your `ANTHROPIC_API_KEY` is missing, wrong, or not set in Vercel. Check Vercel's env var settings; remember env var changes require a redeploy to take effect.

**Magic link emails aren't arriving.**
Custom SMTP via Resend is configured in 3g. Most likely cause is the sandbox-mode constraint — sends to any address other than the Resend account owner's email fail with 403, visible at [resend.com/emails](https://resend.com/emails). If the recipient is correct, check that the Supabase SMTP password still matches an active key at [resend.com/api-keys](https://resend.com/api-keys), the custom-SMTP toggle at `/dashboard/project/_/auth/smtp` is still enabled with fields intact, and the Resend account isn't paused or over its 3,000/month or 100/day free-tier quota.

---

## Next steps

Once the app is running, the next work is driven by the phase plan in `PROJECT_OUTLINE.md`. For a brand-new fork, Phase 0 is complete as soon as this setup guide runs clean end-to-end.

Go read:
- [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) for the phase roadmap.
- [`CLAUDE.md`](./CLAUDE.md) for conventions Claude Code will enforce.
- [`DECISION_LOG.md`](./DECISION_LOG.md) for why the architecture is what it is.
