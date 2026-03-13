# Infrastructure Security Reference

> **Version:** 1.0.0
> **Last Updated:** 2026-03-06
> **Applicability:** Cloud-native applications (AWS, GCP, Vercel, Supabase), CI/CD pipelines, containerized deployments
> **Dependencies:** Cloud provider, CI/CD platform (GitHub Actions, GitLab CI), container runtime

---

## Environment Separation

### Environment Tiers

| Environment | Purpose | Data | Access | Network |
|---|---|---|---|---|
| Production | Live users | Real data | Restricted (on-call + deploys) | Isolated VPC |
| Staging | Pre-release testing | Synthetic / anonymized | Engineering team | Separate VPC |
| Development | Active development | Synthetic / fixtures | Individual developer | Local or shared VPC |
| Preview | PR-based previews | Synthetic / fixtures | PR author + reviewers | Ephemeral |

### Separation Rules

- Each environment gets its own: database, secrets, API keys, cloud resources
- Never share credentials across environments
- Production secrets are inaccessible from non-production environments
- Network isolation: no cross-environment database connections
- Environment determined by environment variable, never by code branching

### Environment Variable Naming Convention

```bash
# Prefix with environment for clarity in secrets managers
PROD_DATABASE_URL=postgres://...
STAGING_DATABASE_URL=postgres://...

# Or use environment-specific secret stores
# AWS: /prod/database/url  vs  /staging/database/url
# Vercel: environment-scoped variables (Production, Preview, Development)
```

### Infrastructure as Code

- All environments defined in IaC (Terraform, Pulumi, CloudFormation)
- Environment differences parameterized, not hard-coded
- Production infrastructure changes require approval (PR review + plan review)
- Drift detection enabled (Terraform Cloud, Spacelift)

---

## Secrets Management

### Secret Types and Storage

| Secret Type | Storage | Rotation | Notes |
|---|---|---|---|
| Database credentials | Secrets manager | 90 days | Auto-rotate if supported |
| API keys (third-party) | Secrets manager | Per provider policy | Alert on usage anomalies |
| JWT signing keys | Secrets manager | 6-12 months | Support key overlap during rotation |
| Encryption keys | KMS / Vault | Annually | Envelope encryption |
| OAuth client secrets | Secrets manager | On compromise | Update callback URLs simultaneously |
| TLS certificates | Certificate manager | Auto-renew (Let's Encrypt) | Monitor expiry |

### Environment Variables

```bash
# NEVER commit secrets to source control
# .env files are for LOCAL development only

# .gitignore (mandatory)
.env
.env.*
!.env.example

# .env.example — committed, documents required vars (no real values)
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
JWT_SECRET=generate-a-256-bit-secret-here
STRIPE_SECRET_KEY=sk_test_...
```

### HashiCorp Vault Pattern

```javascript
// Application reads secrets at startup
import Vault from 'node-vault';

const vault = Vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,  // Or use AppRole / Kubernetes auth
});

async function getSecrets() {
  const { data } = await vault.read('secret/data/myapp/production');
  return {
    databaseUrl: data.data.database_url,
    jwtSecret: data.data.jwt_secret,
  };
}
```

### AWS Secrets Manager Pattern

```javascript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(name) {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: name })
  );
  return JSON.parse(response.SecretString);
}

// Usage
const dbCreds = await getSecret('prod/myapp/database');
```

### Vercel Environment Variables

```bash
# Set via CLI (scoped to environment)
vercel env add DATABASE_URL production
vercel env add DATABASE_URL preview
vercel env add DATABASE_URL development

# Sensitive secrets: mark as "Sensitive" in Vercel dashboard
# Sensitive vars are encrypted and not visible after creation
```

### Secret Hygiene Rules

- Secrets never in source code, commit history, logs, or error messages
- Scan for secrets in CI: use tools like `trufflehog`, `gitleaks`, or GitHub secret scanning
- If a secret is committed: rotate immediately, then clean history
- Application should fail to start if required secrets are missing (fail-fast)
- Secrets in memory should be short-lived; do not cache beyond necessity

---

## CI/CD Pipeline Security

### GitHub Actions Security

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

permissions:
  contents: read          # Principle of least privilege for GITHUB_TOKEN

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # Requires environment approval rules
    steps:
      - uses: actions/checkout@v4

      # Pin actions to SHA, not tags (tags can be moved)
      - uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a  # v4.2.0

      - name: Install dependencies
        run: npm ci               # ci, not install (respects lockfile)

      - name: Run tests
        run: npm test

      - name: Deploy
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}   # From GitHub Secrets
        run: npm run deploy
```

### CI/CD Security Rules

| Rule | Implementation |
|---|---|
| Pin dependencies | Use SHA hashes for Actions, lockfiles for packages |
| Least privilege tokens | Scope `GITHUB_TOKEN` permissions per workflow |
| Environment protection | Require approvals for production deployments |
| Secret masking | CI platform auto-masks; never echo secrets |
| Artifact security | Sign build artifacts, verify before deployment |
| Branch protection | Require PR reviews, status checks, signed commits |
| Immutable deployments | Deploy exact commit hash, not branch head |

### Branch Protection Configuration

```
main branch:
  - Require pull request reviews (1+ approvals)
  - Require status checks (tests, lint, security scan)
  - Require linear history (no merge commits or squash)
  - Restrict pushes (no direct push to main)
  - Require signed commits (optional but recommended)
  - No force pushes
  - No branch deletion
```

### Supply Chain Security

- Audit `package-lock.json` / `yarn.lock` changes in PRs
- Use `npm audit` / `yarn audit` in CI pipeline
- Consider using a private registry or proxy (Artifactory, Verdaccio)
- Verify package integrity via lockfile checksums

---

## Dependency Vulnerability Scanning

### Automated Scanning Tools

| Tool | Coverage | Integration |
|---|---|---|
| Dependabot (GitHub) | npm, pip, Go, Rust, etc. | Native GitHub, auto-PRs |
| Snyk | Packages + containers + IaC | CLI, CI, GitHub App |
| Socket.dev | Supply chain attacks | GitHub App, npm |
| npm audit | npm packages | CLI, CI |
| Trivy | Containers + filesystem | CLI, CI |

### Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    reviewers:
      - security-team
    labels:
      - dependencies
      - security
    # Group minor/patch updates to reduce PR noise
    groups:
      production-dependencies:
        patterns:
          - "*"
        update-types:
          - minor
          - patch

  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

### Snyk in CI

```yaml
# GitHub Actions
- name: Snyk security scan
  uses: snyk/actions/node@master
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  with:
    args: --severity-threshold=high --fail-on=all
```

### Vulnerability Response Policy

| Severity | Response Time | Action |
|---|---|---|
| Critical (CVSS 9.0+) | 24 hours | Patch or mitigate immediately |
| High (CVSS 7.0-8.9) | 7 days | Patch in next release |
| Medium (CVSS 4.0-6.9) | 30 days | Schedule patch |
| Low (CVSS 0.1-3.9) | 90 days | Assess and schedule |

---

## Pre-Commit Hooks

### Setup with Husky + lint-staged

```bash
npm install --save-dev husky lint-staged
npx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.{js,ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

### Security-Focused Hooks

```bash
# .husky/pre-commit
#!/bin/sh

# Lint and format
npx lint-staged

# Check for secrets in staged files
npx gitleaks protect --staged --verbose

# Check for vulnerable dependencies (fast check)
npm audit --audit-level=high --omit=dev
```

### gitleaks Configuration

```toml
# .gitleaks.toml
title = "gitleaks config"

[[rules]]
id = "generic-api-key"
description = "Generic API Key"
regex = '''(?i)(api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?'''

[[rules]]
id = "aws-access-key"
description = "AWS Access Key"
regex = '''AKIA[0-9A-Z]{16}'''

[allowlist]
paths = [
  '''.env\.example''',
  '''\.gitleaks\.toml''',
]
```

### Pre-Push Hook (Heavier Checks)

```bash
# .husky/pre-push
#!/bin/sh

# Run full test suite
npm test

# Full dependency audit
npm audit --audit-level=moderate
```

---

## Container Security

### Dockerfile Best Practices

```dockerfile
# 1. Use specific, minimal base image
FROM node:22-alpine AS base

# 2. Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 3. Multi-stage build: build stage
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts     # No post-install scripts in build
COPY . .
RUN npm run build

# 4. Production stage: minimal final image
FROM base AS production
WORKDIR /app

# 5. Copy only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# 6. Copy built application
COPY --from=builder /app/dist ./dist

# 7. Switch to non-root user
USER appuser

# 8. Read-only filesystem where possible
# (configure at runtime with --read-only flag)

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Container Security Rules

| Rule | Implementation |
|---|---|
| Minimal base image | `alpine` or `distroless` variants |
| No root | `USER nonroot` in Dockerfile |
| No secrets in image | Use runtime environment variables or mounted secrets |
| Read-only filesystem | `docker run --read-only` or Kubernetes `readOnlyRootFilesystem` |
| Scan for vulnerabilities | `trivy image myapp:latest` in CI |
| Pin base image digests | `FROM node:22-alpine@sha256:abc...` |
| No unnecessary packages | Do not install curl, wget, shells in production images |
| Resource limits | Set CPU/memory limits in orchestrator |

### Image Scanning in CI

```yaml
# GitHub Actions
- name: Build image
  run: docker build -t myapp:${{ github.sha }} .

- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    format: table
    exit-code: 1
    severity: CRITICAL,HIGH
```

### Runtime Security

```yaml
# docker-compose.yml security settings
services:
  app:
    image: myapp:latest
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /tmp:noexec,nosuid,size=64m
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

---

## DNS and SSL Certificate Management

### SSL/TLS Configuration

| Setting | Recommended Value |
|---|---|
| Minimum TLS version | TLS 1.2 (prefer 1.3) |
| Certificate type | Let's Encrypt (auto-renew) or managed provider |
| Key type | ECDSA P-256 (preferred) or RSA 2048+ |
| HSTS | `max-age=31536000; includeSubDomains; preload` |
| OCSP Stapling | Enabled |
| Certificate Transparency | Required (default for public CAs) |

### Certificate Management

```bash
# Let's Encrypt with certbot
certbot certonly --dns-cloudflare \
  -d example.com \
  -d "*.example.com" \
  --preferred-challenges dns-01

# Auto-renewal (cron or systemd timer)
certbot renew --deploy-hook "systemctl reload nginx"
```

### Certificate Monitoring

- Monitor certificate expiry (alert at 30, 14, 7 days)
- Monitor Certificate Transparency logs for unauthorized issuance
- Use CAA DNS records to restrict which CAs can issue for your domain

```
# DNS CAA record — only Let's Encrypt can issue
example.com. CAA 0 issue "letsencrypt.org"
example.com. CAA 0 issuewild "letsencrypt.org"
example.com. CAA 0 iodef "mailto:security@example.com"
```

### DNS Security

```
# DNSSEC — enable if your registrar supports it

# SPF — prevent email spoofing
example.com. TXT "v=spf1 include:_spf.google.com -all"

# DKIM — email authentication
selector._domainkey.example.com. TXT "v=DKIM1; k=rsa; p=..."

# DMARC — email policy
_dmarc.example.com. TXT "v=DMARC1; p=reject; rua=mailto:dmarc@example.com"
```

### DNS Configuration Rules

- Use a reputable DNS provider with DDoS protection (Cloudflare, Route53)
- Enable DNSSEC if registrar supports it
- Set short TTL (300s) during migrations, normal TTL (3600s) otherwise
- Configure SPF, DKIM, and DMARC for all domains that send email
- Monitor for unauthorized DNS changes
- Use separate DNS accounts for production (restricted access)
- CAA records on all domains

### Managed Platform SSL (Vercel, Cloudflare)

- Vercel: automatic SSL for custom domains (Let's Encrypt), no configuration needed
- Cloudflare: automatic SSL with edge certificates; configure Full (Strict) mode for origin
- Supabase: automatic SSL for database connections and API endpoints
- Always verify SSL is active after adding a custom domain

---

## Quick Checklist

- [ ] Environments fully isolated: separate databases, secrets, API keys, networks
- [ ] No production data in non-production environments
- [ ] All secrets in a secrets manager (Vault, AWS SM, Vercel env vars)
- [ ] No secrets in source control; `.env` in `.gitignore`; secret scanning enabled
- [ ] CI/CD actions pinned to SHA; `GITHUB_TOKEN` scoped minimally
- [ ] Branch protection: required reviews, status checks, no direct push to main
- [ ] Dependabot or Snyk enabled with weekly scanning
- [ ] Vulnerability response policy defined with SLA per severity
- [ ] Pre-commit hooks: linting, formatting, secret detection
- [ ] Container images: minimal base, non-root, scanned, no embedded secrets
- [ ] SSL/TLS 1.2+ enforced; HSTS enabled; certificates auto-renewed
- [ ] CAA, SPF, DKIM, DMARC DNS records configured
- [ ] Infrastructure defined as code; production changes require approval
- [ ] Certificate expiry monitoring with alerting
