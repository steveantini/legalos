# Environment Management

| Field | Value |
|---|---|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-03-06 |
| **Applicability** | Multi-environment web applications (dev/staging/prod), any hosting platform |
| **Dependencies** | Environment variable system, database migration tool, feature flag service (optional) |

---

## Multi-Environment Strategy

### Environment Tiers

| Environment | Purpose | Data | Deployment Trigger |
|---|---|---|---|
| **Local (dev)** | Individual developer work | Seeded/mock data | Manual |
| **Preview** | PR-specific isolated testing | Seeded data or branch DB | Push to PR branch |
| **Staging** | Pre-production validation | Production-like data (anonymized) | Merge to `main` |
| **Production** | Live user traffic | Real data | Manual approval or tag |

### Environment Parity Principle

Keep all environments as similar as possible. Differences should be limited to:
- Connection strings and API keys
- Feature flags
- Logging verbosity
- Rate limits and scaling configuration

Never differ on: framework version, Node.js version, build process, dependency versions.

---

## Dev/Staging/Prod Configuration

### Configuration Hierarchy

```
1. Defaults in code (lowest priority)
2. .env file (local development)
3. .env.local (local overrides, gitignored)
4. Platform environment variables (staging/prod — highest priority)
```

### File Structure

```
.env                  ← Shared defaults, committed (no secrets)
.env.local            ← Local overrides, gitignored
.env.example          ← Template with all required vars, committed
.env.test             ← Test environment overrides
```

### `.env.example` — Required Variables Template

```bash
# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp_dev

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# External Services
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=

# Feature Flags
FEATURE_FLAG_PROVIDER_KEY=
```

### Environment-Specific Values

| Variable | Local | Staging | Production |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` | `production` |
| `DATABASE_URL` | Local PostgreSQL | Staging DB (pooled) | Prod DB (pooled) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://staging.example.com` | `https://example.com` |
| `LOG_LEVEL` | `debug` | `debug` | `info` |
| `RATE_LIMIT` | `1000/min` | `100/min` | `100/min` |

---

## Environment Variable Management

### Validation at Startup

Never trust that env vars exist. Validate on application boot.

```typescript
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
});

export const env = envSchema.parse(process.env);
```

### Typing

```typescript
// env.d.ts (if not using Zod runtime validation)
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    NEXTAUTH_SECRET: string;
    NODE_ENV: 'development' | 'production' | 'test';
  }
}
```

### Security Rules

- Never log environment variables, even in development.
- Never include secrets in client bundles (`NEXT_PUBLIC_` exposes to browser).
- Rotate secrets on a schedule (90 days minimum).
- Use separate credentials per environment — never share prod keys with staging.
- Store secrets in the deployment platform (Vercel, AWS SSM, Vault), not in files.

### Syncing Across Team

- Use `vercel env pull` or equivalent platform command.
- Maintain `.env.example` as the canonical list of required variables.
- Document non-obvious variables in `.env.example` with comments.
- CI should validate that all `.env.example` vars are set in the target environment.

---

## Database Migration Promotion

### Migration Flow

```
Developer writes migration
  |
  v
Apply to local DB (test)
  |
  v
Commit migration file
  |
  v
PR merged → apply to staging DB (automated)
  |
  v
Verify staging
  |
  v
Apply to production DB (automated on deploy or manual)
```

### Migration Best Practices

- **Forward-only**: Never edit a migration after it has been applied to staging/prod.
- **Backward-compatible**: Each migration must work with the previous application version.
- **Small and incremental**: One concern per migration.
- **Idempotent when possible**: Use `IF NOT EXISTS`, `IF EXISTS` guards.
- **No data loss**: Rename in two steps (add new, migrate data, drop old) across releases.

### Backward-Compatible Migration Pattern

When renaming a column:

```
Release 1: Add new column, write to both old and new
Release 2: Migrate reads to new column, backfill data
Release 3: Drop old column
```

### Migration Tools

| Tool | Framework | Command |
|---|---|---|
| Drizzle Kit | Drizzle ORM | `drizzle-kit push` / `drizzle-kit migrate` |
| Prisma Migrate | Prisma | `prisma migrate deploy` |
| Supabase CLI | Supabase | `supabase db push` / `supabase migration up` |
| golang-migrate | Raw SQL | `migrate -path ./migrations up` |

### CI Migration Step

```yaml
- name: Run Migrations
  run: pnpm drizzle-kit migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Migration Safety Checks

- **Lint migrations**: Check for destructive operations (DROP TABLE, DROP COLUMN).
- **Lock timeout**: Set `SET lock_timeout = '5s'` to prevent long table locks.
- **Test rollback**: Verify `down` migrations work in development.
- **Dry run**: Preview SQL before applying: `drizzle-kit migrate --dry-run`.

---

## Feature Flags

### Purpose

Decouple deployment from release. Ship code to production behind flags, enable gradually.

### Implementation Approaches

| Approach | Best For | Trade-offs |
|---|---|---|
| Environment variables | Simple on/off per environment | No runtime toggling, redeploy needed |
| Database-backed | Custom control, audit trail | Must build UI, more maintenance |
| Service (LaunchDarkly, Flagsmith, PostHog) | Gradual rollout, targeting, analytics | External dependency, cost |

### Simple Feature Flag System

```typescript
// lib/feature-flags.ts
type FeatureFlag = 'new-dashboard' | 'ai-chat' | 'v2-api';

const flags: Record<string, Record<FeatureFlag, boolean>> = {
  development: {
    'new-dashboard': true,
    'ai-chat': true,
    'v2-api': true,
  },
  staging: {
    'new-dashboard': true,
    'ai-chat': true,
    'v2-api': false,
  },
  production: {
    'new-dashboard': false,
    'ai-chat': false,
    'v2-api': false,
  },
};

export function isEnabled(flag: FeatureFlag): boolean {
  const env = process.env.NODE_ENV ?? 'development';
  return flags[env]?.[flag] ?? false;
}
```

### Flag Lifecycle

1. **Create**: Add flag, default OFF in production.
2. **Develop**: Build feature behind flag.
3. **Test**: Enable in staging, verify.
4. **Rollout**: Enable in production (percentage or full).
5. **Clean up**: Remove flag and conditional code after full rollout is stable.

### Flag Hygiene

- Set expiry dates on flags. Review monthly.
- Never nest flags (flag A depends on flag B).
- Remove flag code within 2 sprints of full rollout.
- Log flag evaluations for debugging.

---

## Rollback Procedures

### Application Rollback

| Platform | Command | Effect |
|---|---|---|
| Vercel | `vercel promote <deployment-url>` | Instant, serves previous build |
| Docker | `docker rollback <service>` | Reverts to previous image |
| Kubernetes | `kubectl rollout undo deployment/<name>` | Previous replica set |

### Database Rollback

- **Preferred**: Fix forward with a new migration. Rollback migrations are risky with data loss.
- **If necessary**: Apply the `down` migration, but only if no destructive data changes occurred.
- **Point-in-time recovery**: Restore database from backup to a specific timestamp (last resort).

### Rollback Decision Tree

```
Issue detected in production
  |
  +-- Is it a UI/logic bug?
  |     +-- Yes → Rollback application deployment
  |     +-- Verify database compatibility with previous version
  |
  +-- Is it a data/migration issue?
  |     +-- Yes → Fix forward with corrective migration
  |     +-- If data loss → Restore from backup (coordinate with team)
  |
  +-- Is it an external service issue?
        +-- Yes → Enable fallback/circuit breaker, not a rollback
```

### Rollback Checklist

1. Communicate to team: "Rolling back production to deployment X."
2. Execute rollback.
3. Verify health endpoint and critical paths.
4. Check error monitoring (Sentry) for new errors.
5. Notify stakeholders.
6. Create incident report.
7. Fix forward on a branch.

---

## Data Seeding

### Seed Strategy by Environment

| Environment | Seed Source | Data Volume |
|---|---|---|
| Local | Seed script (deterministic) | Minimal (fast setup) |
| Test (CI) | Seed script or fixtures | Minimal (fast tests) |
| Preview | Seed script | Moderate (realistic testing) |
| Staging | Anonymized production snapshot | Full-scale |
| Production | Bootstrap script (admin user, config) | Minimal (initial setup only) |

### Seed Script Structure

```typescript
// scripts/seed.ts
import { db } from '@/lib/db';
import { users, organizations, projects } from '@/lib/db/schema';

async function seed() {
  console.log('Seeding database...');

  // Clear existing data (dev only)
  if (process.env.NODE_ENV !== 'production') {
    await db.delete(projects);
    await db.delete(users);
    await db.delete(organizations);
  }

  // Seed in dependency order
  const [org] = await db.insert(organizations).values({
    name: 'Acme Corp',
    slug: 'acme',
  }).returning();

  const [adminUser] = await db.insert(users).values({
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    organizationId: org.id,
  }).returning();

  await db.insert(projects).values([
    { name: 'Project Alpha', organizationId: org.id, ownerId: adminUser.id },
    { name: 'Project Beta', organizationId: org.id, ownerId: adminUser.id },
  ]);

  console.log('Seeding complete.');
}

seed().catch(console.error).finally(() => process.exit());
```

### Running Seeds

```json
{
  "scripts": {
    "db:seed": "tsx scripts/seed.ts",
    "db:reset": "pnpm db:migrate && pnpm db:seed",
    "db:fresh": "pnpm db:drop && pnpm db:migrate && pnpm db:seed"
  }
}
```

### Production Data Anonymization (for Staging)

When copying production data to staging:

- Replace emails with `user-{id}@staging.example.com`.
- Replace names with faker-generated names.
- Nullify sensitive fields (SSN, payment tokens, API keys).
- Preserve relational integrity (foreign keys, IDs).
- Automate with a script; never manually edit production dumps.
- Never copy production data to local development machines.

---

## Environment Checklist — New Project Setup

- [ ] `.env.example` committed with all required variables documented
- [ ] `.env.local` in `.gitignore`
- [ ] Env validation (Zod) runs at app startup
- [ ] Staging environment provisioned with separate credentials
- [ ] Production environment provisioned with separate credentials
- [ ] Database migration pipeline configured (auto-apply on deploy)
- [ ] Seed script works for local setup (`pnpm db:seed`)
- [ ] Feature flag system in place (even if env-var based)
- [ ] Rollback procedure documented and tested
- [ ] Secrets rotation schedule established
