# Setup Guide

This guide walks you from an empty machine to a running local dev environment for `legal-department-launchpad-template`, and then through deploying your own instance to Vercel.

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
git clone git@github.com:<your-username>/legal-department-launchpad-template.git
cd legal-department-launchpad-template
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

### 3d. Run the initial schema

Open the Supabase dashboard → **SQL Editor** → **New query**. Paste the contents of `supabase/migrations/0001_initial_schema.sql` (which is the `supabase-schema-v0.sql` file from this setup bundle, renamed and placed in the migrations folder) and click **Run**.

You should see the following tables created:
- `organizations`
- `users`
- `departments`
- `user_department_roles`
- `agents`

Every table has RLS enabled and policies in place. Verify this in **Authentication → Policies** — every table should show at least one policy.

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

### 3f. Seed your first organization, department, and admin user

In **SQL Editor**, run:

```sql
-- 1. Create your organization
insert into organizations (id, name, slug)
values (gen_random_uuid(), 'Your Company, Inc.', 'your-company')
returning id;
-- Copy the returned id; you'll paste it into the next queries.

-- 2. Create the five starting departments (replace ORG_ID with the id from step 1)
insert into departments (organization_id, slug, name, description, sort_order) values
  ('ORG_ID', 'commercial', 'Commercial', 'Contract review, vendor agreements, commercial operations.', 1),
  ('ORG_ID', 'ma', 'Mergers & Acquisitions', 'Deal diligence, merger agreements, integration planning.', 2),
  ('ORG_ID', 'public-sector', 'Public Sector', 'Government contracts and public-sector matters.', 3),
  ('ORG_ID', 'grra', 'Government Relations & Regulatory Affairs', 'Lobbying, regulatory monitoring, policy advocacy.', 4),
  ('ORG_ID', 'privacy', 'Privacy', 'Data privacy, DPAs, regulatory compliance (GDPR, CCPA, etc.).', 5);
```

Then create your first admin user. The cleanest way:

1. Start the dev server: `npm run dev`.
2. Go to `http://localhost:3000/login` and sign up with email + magic link.
3. Check your inbox, click the magic link, and you'll land authenticated.
4. In Supabase SQL Editor, promote yourself to `org_admin`:

```sql
-- Replace YOUR_EMAIL and ORG_ID
insert into users (id, organization_id, email, role)
select au.id, 'ORG_ID', au.email, 'org_admin'
from auth.users au
where au.email = 'YOUR_EMAIL'
on conflict (id) do update set role = 'org_admin';

-- Grant yourself access to all five departments
insert into user_department_roles (user_id, department_id, role)
select u.id, d.id, 'dept_admin'
from users u
cross join departments d
where u.email = 'YOUR_EMAIL' and d.organization_id = 'ORG_ID';
```

Refresh the app. You should now see the admin nav and all five departments.

#### Alternative: production-only setup (no local dev)

If this Supabase project is your **production** project and you don't want
to spin up local dev just to create the first user, create the auth user
directly in the dashboard:

1. In Supabase, go to **Authentication → Users → Add user → Create new
   user**. Enter the admin email. You can either set a temporary password
   or leave "Auto confirm user" checked and rely on magic-link sign-in
   later.
2. Run the organization + departments SQL block above against the prod
   project.
3. Run the user promotion + `user_department_roles` SQL block above —
   it joins on `auth.users` by email, so the user you just created in
   step 1 will be picked up.
4. The seeded `public.users` row remains intact; the RPC's idempotent
   guard means first sign-in is a no-op for the admin user. (For
   non-admin users created later via magic-link signup, the RPC creates
   their `public.users` row on first sign-in.)

This is the path Session 7 used for the production deploy. The dev-signup
path above remains the recommended flow for the dev project.

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
  siteTitle: "Legal AI Launchpad",
  departmentName: "Legal",
  themePreset: "carbon",  // "carbon" | "modern" | "minimal" | "custom"
  adminEmail: "legal-ops@yourcompany.com",
};
```

### Theme

The template ships with three presets: Carbon (IBM-inspired, `#0f62fe`), Modern (indigo, `#6366f1`), and Minimal (monochrome, `#18181b`). Pick one in `siteConfig.themePreset`, or choose `"custom"` and override the tokens in `config/theme.ts`.

### Departments

Departments are database rows, not code. To add a new department:

1. Insert a row into the `departments` table (see the seed block above for the pattern).
2. That's it. The app picks it up on next page load.

To remove a department, soft-delete it by setting `is_active = false`. Do not hard-delete — existing agents and analytics events reference it.

### Agents

Once Phase 5's Agent Admin UI is built, agents can be created and edited in-app by `org_admin` or `dept_admin` users. Until then, seed agents directly in SQL:

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
Check the `user_department_roles` table — your user needs at least one row per department they should see. The admin seed block in 3f grants access to all five.

**"Could not find the function public.xyz" or missing table errors.**
The schema migration didn't run cleanly. Re-run `supabase/migrations/0001_initial_schema.sql` in the SQL editor. Check the query log for errors.

**RLS policy is blocking me from seeing my own data.**
This is the policies doing their job, but wrong. Check that your user row exists in `public.users` (not just `auth.users`) with the correct `organization_id` and `role`. The seed block in 3f handles this.

**Vercel build fails on TypeScript errors.**
Run `npm run build` locally first to catch them. TypeScript errors fail the Vercel build on purpose — this is a feature, not a bug.

**Anthropic calls return 401.**
Your `ANTHROPIC_API_KEY` is missing, wrong, or not set in Vercel. Check Vercel's env var settings; remember env var changes require a redeploy to take effect.

**Magic link emails aren't arriving.**
Supabase's free tier has a small email quota using their default SMTP. For real use, configure a custom SMTP provider (Resend, Postmark, SendGrid) in Supabase → **Authentication → Email**.

---

## Next steps

Once the app is running, the next work is driven by the phase plan in `PROJECT_OUTLINE.md`. For a brand-new fork, Phase 0 is complete as soon as this setup guide runs clean end-to-end.

Go read:
- [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) for the phase roadmap.
- [`CLAUDE.md`](./CLAUDE.md) for conventions Claude Code will enforce.
- [`DECISION_LOG.md`](./DECISION_LOG.md) for why the architecture is what it is.
