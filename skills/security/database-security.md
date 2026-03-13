# Database Security Reference

> **Version:** 1.0.0
> **Last Updated:** 2026-03-06
> **Applicability:** PostgreSQL (primary), Supabase, MySQL, general relational databases
> **Dependencies:** Database provider, ORM (Prisma, Drizzle, etc.), encryption libraries

---

## Row-Level Security (RLS)

### Design Principles

- RLS enforces access control at the database layer — acts as the last line of defense
- Every table containing user data should have RLS enabled
- Policies should be additive: start with no access, grant explicitly
- Test policies with different user contexts before deploying

### Enabling RLS (PostgreSQL / Supabase)

```sql
-- Enable RLS on table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Force RLS on table owners too (prevents bypass)
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
```

### Policy Patterns

#### User Owns Row

```sql
-- Users can only see their own data
CREATE POLICY "users_own_data" ON documents
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

#### Role-Based Access

```sql
-- Admins can see all rows; users see only their own
CREATE POLICY "role_based_access" ON documents
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'admin'
    OR user_id = auth.uid()
  );
```

#### Organization/Tenant Isolation

```sql
-- Users can only access data within their organization
CREATE POLICY "tenant_isolation" ON projects
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );
```

#### Shared Access (Collaboration)

```sql
-- Owner or explicitly shared users
CREATE POLICY "shared_access" ON documents
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR id IN (
      SELECT document_id FROM document_shares
      WHERE shared_with = auth.uid()
      AND expires_at > now()
    )
  );
```

#### Separate Policies by Operation

```sql
-- SELECT: users see their own + shared
CREATE POLICY "read_own_or_shared" ON documents
  FOR SELECT
  USING (user_id = auth.uid() OR is_public = true);

-- INSERT: users can only create for themselves
CREATE POLICY "insert_own" ON documents
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: users can only update their own
CREATE POLICY "update_own" ON documents
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: users can only delete their own
CREATE POLICY "delete_own" ON documents
  FOR DELETE
  USING (user_id = auth.uid());
```

### RLS Performance Considerations

- Add indexes on columns used in policy conditions (`user_id`, `org_id`)
- Avoid expensive subqueries in policies — use JOINs or materialized views
- Use `security_invoker = true` on views to respect RLS
- Test with `EXPLAIN ANALYZE` to verify query plan efficiency

### Common RLS Mistakes

- Forgetting `FORCE ROW LEVEL SECURITY` (table owner bypasses policies by default)
- Missing `WITH CHECK` on INSERT/UPDATE (allows writing data the user cannot read)
- Not handling NULL values in policy conditions
- Overly complex policies that impact query performance
- Forgetting to add policies to new tables

---

## Column-Level Encryption

### When to Encrypt at Column Level

Encrypt columns containing: SSN, tax IDs, payment card numbers, health data, biometric data, and any data subject to regulatory requirements (HIPAA, PCI-DSS, GDPR).

### Application-Level Encryption (Recommended)

```javascript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(ciphertext, key) {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### PostgreSQL pgcrypto

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt on insert
INSERT INTO users (email, ssn_encrypted)
VALUES ('user@example.com', pgp_sym_encrypt('123-45-6789', current_setting('app.encryption_key')));

-- Decrypt on read
SELECT email, pgp_sym_decrypt(ssn_encrypted::bytea, current_setting('app.encryption_key')) AS ssn
FROM users WHERE id = 1;
```

### Key Management Rules

- Encryption keys stored in secrets manager (AWS KMS, HashiCorp Vault), never in database
- Use envelope encryption: data key encrypts data, master key encrypts data key
- Rotate data encryption keys periodically (re-encrypt data)
- Different keys for different data classifications
- Audit key access

### Searchability Considerations

Encrypted columns cannot be searched directly. Strategies:
- **Blind index:** Store a keyed hash (HMAC) alongside encrypted data for equality lookups
- **Deterministic encryption:** Same plaintext produces same ciphertext (enables equality search, but leaks frequency)
- Prefer blind index approach for security-sensitive data

```javascript
// Blind index for encrypted email lookup
const blindIndex = crypto.createHmac('sha256', BLIND_INDEX_KEY)
  .update(email.toLowerCase().trim())
  .digest('hex');
// Store blindIndex in a separate indexed column
```

---

## Connection Security

### SSL/TLS Configuration

```javascript
// Node.js PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,           // Verify server certificate
    ca: fs.readFileSync('/path/to/ca-cert.pem'),  // CA certificate
  },
});
```

```
# PostgreSQL server (postgresql.conf)
ssl = on
ssl_cert_file = '/path/to/server-cert.pem'
ssl_key_file = '/path/to/server-key.pem'
ssl_ca_file = '/path/to/ca-cert.pem'
ssl_min_protocol_version = 'TLSv1.3'
```

### Connection Security Rules

- Always enforce SSL in production (`sslmode=verify-full` for PostgreSQL)
- Never use `rejectUnauthorized: false` in production
- Restrict database to private network / VPC — no public internet access
- Use connection pooling with PgBouncer or built-in pool; limit max connections
- Rotate database credentials on a schedule
- Connection strings in environment variables or secrets manager, never in code

### Network Restrictions

```sql
-- PostgreSQL pg_hba.conf: restrict by IP and require SSL
hostssl  mydb  appuser  10.0.1.0/24  scram-sha-256
hostssl  mydb  appuser  10.0.2.0/24  scram-sha-256
# Deny all other connections by default
host     all   all      0.0.0.0/0    reject
```

---

## Backup Encryption

### Backup Security Requirements

- Encrypt all backups at rest (AES-256)
- Encrypt backup transfers in transit (TLS/SSH)
- Store backups in a separate region from primary database
- Test restore procedures regularly
- Retain backups per retention policy (not indefinitely)
- Restrict backup access to ops/DBA roles only

### Encrypted Backup (pg_dump)

```bash
# Encrypted backup using GPG
pg_dump -h localhost -U dbuser mydb | gpg --symmetric --cipher-algo AES256 -o backup.sql.gpg

# Restore
gpg --decrypt backup.sql.gpg | psql -h localhost -U dbuser mydb

# Encrypted backup to S3 with server-side encryption
pg_dump -h localhost -U dbuser mydb | gzip | \
  aws s3 cp - s3://backups-bucket/mydb/$(date +%Y%m%d).sql.gz \
  --sse aws:kms --sse-kms-key-id alias/backup-key
```

### Managed Service Backups

- Supabase: automatic daily backups (Pro plan), point-in-time recovery
- AWS RDS: automatic backups with KMS encryption, cross-region replication
- Verify encryption is enabled — do not assume it is the default

---

## Access Audit Logging

### What to Log

| Event | Details to Capture |
|---|---|
| Schema changes (DDL) | Who, what, when, from where |
| Data access (sensitive tables) | User, table, operation, row count |
| Failed authentication | Username, IP, timestamp |
| Privilege changes | Granting/revoking roles |
| Data exports | User, table, volume |
| RLS policy changes | Old and new policy |

### PostgreSQL Audit Extension (pgaudit)

```sql
-- Install
CREATE EXTENSION pgaudit;

-- Configure in postgresql.conf
-- pgaudit.log = 'ddl, role, write'
-- pgaudit.log_catalog = off

-- Per-role auditing
ALTER ROLE appuser SET pgaudit.log = 'read, write';
```

### Application-Level Audit Table

```sql
CREATE TABLE audit_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      UUID NOT NULL,
  action       TEXT NOT NULL,        -- 'select', 'insert', 'update', 'delete'
  table_name   TEXT NOT NULL,
  record_id    TEXT,
  old_values   JSONB,               -- Previous state (for updates/deletes)
  new_values   JSONB,               -- New state (for inserts/updates)
  ip_address   INET,
  user_agent   TEXT
);

-- Index for querying
CREATE INDEX idx_audit_user ON audit_log (user_id, timestamp);
CREATE INDEX idx_audit_table ON audit_log (table_name, timestamp);

-- Trigger-based auditing
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    current_setting('app.current_user_id', true)::uuid,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_documents
  AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

### Audit Log Protection

- Audit log table should be append-only (no UPDATE/DELETE for application roles)
- Separate storage from application database if possible
- Retain per compliance requirements (typically 1-7 years)
- Ship to external SIEM/log aggregation system

---

## Least Privilege for Database Roles

### Role Hierarchy

```sql
-- Application role: minimal permissions
CREATE ROLE app_readonly;
GRANT CONNECT ON DATABASE mydb TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

CREATE ROLE app_readwrite;
GRANT app_readonly TO app_readwrite;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;

-- Migration role: schema changes only
CREATE ROLE app_migrator;
GRANT CONNECT ON DATABASE mydb TO app_migrator;
GRANT CREATE ON SCHEMA public TO app_migrator;
-- Run migrations with this role, not the application role

-- Login users for each role
CREATE USER api_service WITH PASSWORD '...' IN ROLE app_readwrite;
CREATE USER report_service WITH PASSWORD '...' IN ROLE app_readonly;
CREATE USER migration_runner WITH PASSWORD '...' IN ROLE app_migrator;
```

### Permission Rules

- Application should not own tables or have `CREATE` privilege
- Use separate credentials for read replicas (read-only role)
- Background workers get scoped roles based on their function
- Admin/superuser access only via bastion host with MFA
- Revoke `PUBLIC` default privileges:

```sql
REVOKE ALL ON DATABASE mydb FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_readonly;
```

### Default Privileges for New Objects

```sql
-- Ensure new tables get correct permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT INSERT, UPDATE, DELETE ON TABLES TO app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO app_readwrite;
```

---

## SQL Injection Defense at ORM Level

### ORM Safety Model

| ORM | Safe by Default | Danger Zones |
|---|---|---|
| Prisma | Yes | `$queryRawUnsafe`, `$executeRawUnsafe` |
| Drizzle | Yes | `sql.raw()` |
| Knex | Yes (with bindings) | `.whereRaw()` with string interpolation |
| Sequelize | Yes | `sequelize.query()` with string interpolation |
| SQLAlchemy | Yes | `text()` with f-strings |

### Safe Patterns

```javascript
// Prisma: safe raw query (tagged template = parameterized)
const users = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${email} AND status = ${status}
`;

// Drizzle: safe
const users = await db.select().from(usersTable).where(eq(usersTable.email, email));

// Knex: safe (using bindings)
const users = await knex('users').where({ email }).select('*');
const users = await knex.raw('SELECT * FROM users WHERE email = ?', [email]);
```

### Unsafe Patterns to Audit

```javascript
// UNSAFE: Prisma raw unsafe
await prisma.$queryRawUnsafe(`SELECT * FROM ${tableName}`); // SQL injection if tableName is user input

// UNSAFE: Knex raw without bindings
await knex.raw(`SELECT * FROM users WHERE email = '${email}'`);

// UNSAFE: Drizzle sql.raw
await db.execute(sql.raw(`SELECT * FROM users WHERE name = '${name}'`));
```

### Code Review Rule

Grep for these patterns and flag for review:
- `$queryRawUnsafe`, `$executeRawUnsafe`
- `sql.raw(` with template literals
- `.whereRaw(` / `.raw(` with string interpolation (`${` inside)
- Any string concatenation near SQL keywords

---

## PII Handling and Retention

### Data Classification

| Category | Examples | Encryption | Retention | Access |
|---|---|---|---|---|
| Public | Product names, public profiles | Not required | Indefinite | Open |
| Internal | Internal user IDs, preferences | At rest | Business need | Authenticated users |
| Confidential | Email, name, address | At rest | Defined policy | Need-to-know + audit |
| Restricted | SSN, payment cards, health data | At rest + column-level | Regulatory minimum | Strict access + audit |

### Retention Implementation

```sql
-- Soft delete with scheduled hard delete
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN data_retention_until TIMESTAMPTZ;

-- Soft delete
UPDATE users SET
  deleted_at = now(),
  data_retention_until = now() + INTERVAL '30 days'
WHERE id = $1;

-- Scheduled purge job (run daily)
DELETE FROM users
WHERE data_retention_until IS NOT NULL
AND data_retention_until < now();
```

### PII Anonymization

```sql
-- Anonymize instead of delete (preserve analytics data)
UPDATE users SET
  email = 'deleted_' || id || '@anonymized.invalid',
  name = 'Deleted User',
  phone = NULL,
  address = NULL,
  deleted_at = now()
WHERE id = $1;
```

### GDPR / Data Subject Requests

- **Right to Access:** Export all user data in machine-readable format
- **Right to Erasure:** Delete or anonymize all PII (cascade through related tables)
- **Right to Rectification:** Allow users to correct their data
- **Data Portability:** Provide data export in JSON/CSV

### PII in Non-Production Environments

- Never copy production PII to staging/development
- Use data masking or synthetic data generation
- If production data is needed for debugging, anonymize it first

---

## Quick Checklist

- [ ] RLS enabled and forced on all tables with user data
- [ ] RLS policies tested for each role and operation type
- [ ] Restricted PII columns encrypted at application level (AES-256-GCM)
- [ ] Encryption keys in secrets manager, not in database or code
- [ ] SSL enforced on all database connections (`sslmode=verify-full`)
- [ ] Database not accessible from public internet
- [ ] Backups encrypted at rest and tested for restorability
- [ ] Audit logging enabled for sensitive tables and DDL operations
- [ ] Separate database roles for app, read-only, and migrations
- [ ] `PUBLIC` privileges revoked; explicit grants only
- [ ] ORM raw query usage audited for injection risks
- [ ] PII retention policy defined and automated purge in place
- [ ] No production PII in non-production environments
- [ ] Database credentials rotated on schedule
