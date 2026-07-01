import { describe, expect, it } from "vitest";

import type { ExtractedAttributeValue } from "@/lib/deterministic/structured-query";

import {
  WATCHER_FINDINGS_CONFLICT_TARGET,
  computeRenewalFindings,
  parseRenewalScanConfig,
  runRenewalScan,
} from "./renewal-watcher";

/**
 * Tests for the renewal watcher's effect (D-221). computeRenewalFindings is pure
 * (it runs the REAL deterministic Structured Query engine over injected rows with
 * an injected clock), so per-hit + window behaviour is proven with no DB.
 * runRenewalScan is exercised over a lightweight fake client to prove the
 * idempotent upsert (natural key + ignoreDuplicates) and the is_fixture flag.
 */

const NOW = new Date("2026-07-01T00:00:00.000Z");

function expiry(docId: string, dateIso: string): ExtractedAttributeValue {
  return {
    documentId: docId,
    attributeKey: "expiration_date",
    attributeType: "date",
    found: true,
    valueText: dateIso,
    valueNumber: null,
    valueDate: dateIso,
    valueBoolean: null,
    citationVerified: true,
    sourceReadIncomplete: false,
  };
}
function autoRenew(docId: string, value: boolean): ExtractedAttributeValue {
  return {
    documentId: docId,
    attributeKey: "auto_renew",
    attributeType: "boolean",
    found: true,
    valueText: String(value),
    valueNumber: null,
    valueDate: null,
    valueBoolean: value,
    citationVerified: true,
    sourceReadIncomplete: false,
  };
}

// Three expiring within 60 days (a, b, c), two outside (d far future, e already past).
const FIXTURE_ROWS: ExtractedAttributeValue[] = [
  expiry("doc-a", "2026-07-16"), autoRenew("doc-a", false),
  expiry("doc-b", "2026-08-15"), autoRenew("doc-b", true),
  expiry("doc-c", "2026-07-06"), autoRenew("doc-c", false),
  expiry("doc-d", "2027-01-01"), autoRenew("doc-d", false),
  expiry("doc-e", "2026-06-01"), autoRenew("doc-e", false),
];
const TITLES = new Map<string, string>([
  ["doc-a", "Acme Corp Master Services Agreement"],
  ["doc-b", "Bellini Holdings NDA"],
  ["doc-c", "Maddox Legal Retainer"],
  ["doc-d", "Globex Vendor Agreement"],
  ["doc-e", "Initech Statement of Work"],
]);

function compute(rows = FIXTURE_ROWS, windowDays = 60) {
  return computeRenewalFindings({
    rows,
    titleByDoc: TITLES,
    now: NOW,
    windowDays,
    expiryAttributeKey: "expiration_date",
    autoRenewAttributeKey: "auto_renew",
  });
}

describe("computeRenewalFindings — one finding per hit (decision 1b)", () => {
  it("produces exactly one finding per agreement expiring within the window", () => {
    const findings = compute();
    expect(findings.map((f) => f.subjectRef)).toEqual(["doc-a", "doc-b", "doc-c"]);
    // Not one summary finding — three individually-addressable findings.
    expect(findings).toHaveLength(3);
  });

  it("excludes agreements outside the window (far future or already past)", () => {
    const subjects = compute().map((f) => f.subjectRef);
    expect(subjects).not.toContain("doc-d"); // 2027 — beyond 60 days
    expect(subjects).not.toContain("doc-e"); // already expired — before today
  });

  it("stamps the event key with the specific expiry date (a changed date is a new event)", () => {
    const b = compute().find((f) => f.subjectRef === "doc-b");
    expect(b?.eventKey).toBe("expires_2026-08-15");
    expect(b?.title).toBe("Bellini Holdings NDA expires 2026-08-15");
  });

  it("notes auto-renew in the body when the agreement auto-renews", () => {
    const b = compute().find((f) => f.subjectRef === "doc-b"); // auto_renew true
    const a = compute().find((f) => f.subjectRef === "doc-a"); // auto_renew false
    expect(b?.body).toContain("auto-renew");
    expect(a?.body).not.toContain("auto-renew");
  });

  it("a narrower window finds fewer hits (deterministic on the injected clock)", () => {
    // 10-day window: only doc-c (2026-07-06) and doc-a? a is +15 → out. Only doc-c.
    expect(compute(FIXTURE_ROWS, 10).map((f) => f.subjectRef)).toEqual(["doc-c"]);
  });
});

// ---------------------------------------------------------------------------
// runRenewalScan — the idempotent upsert (decision 2)
// ---------------------------------------------------------------------------

type Captured = { table?: string; rows?: unknown[]; opts?: { onConflict: string; ignoreDuplicates: boolean } };

/** A tiny fake serving the collection inventory + extractions and capturing the
 *  watcher_findings upsert. Shapes match the exact call chains runRenewalScan uses. */
function scanDb(captured: Captured, opts: { docs: unknown[]; ex: unknown[] }) {
  return {
    from(table: string) {
      if (table === "collection_documents") {
        const b = {
          select: () => b,
          eq: () => b,
          not: () => Promise.resolve({ data: opts.docs, error: null }),
        };
        return b;
      }
      if (table === "document_extractions") {
        const b = {
          select: () => b,
          in: () => Promise.resolve({ data: opts.ex, error: null }),
        };
        return b;
      }
      // watcher_findings
      return {
        upsert: (rows: unknown[], o: { onConflict: string; ignoreDuplicates: boolean }) => {
          captured.table = table;
          captured.rows = rows;
          captured.opts = o;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const DB_DOCS = [
  { document_id: "doc-a", title: "Acme Corp Master Services Agreement" },
  { document_id: "doc-b", title: "Bellini Holdings NDA" },
  { document_id: "doc-c", title: "Maddox Legal Retainer" },
  { document_id: "doc-d", title: "Globex Vendor Agreement" },
  { document_id: "doc-e", title: "Initech Statement of Work" },
];
// The DB-shaped extraction rows the loader maps to ExtractedAttributeValue.
const DB_EX = FIXTURE_ROWS.map((r) => ({
  document_id: r.documentId,
  attribute_key: r.attributeKey,
  attribute_type: r.attributeType,
  found: r.found,
  value_text: r.valueText,
  value_number: r.valueNumber,
  value_date: r.valueDate,
  value_boolean: r.valueBoolean,
  citation_verified: r.citationVerified,
  source_read_incomplete: r.sourceReadIncomplete,
}));

const CONFIG = {
  collectionId: "col-1",
  scheduleId: "sch-1",
  windowDays: 60,
  findingKind: "renewal",
  isFixture: true,
};

describe("runRenewalScan — idempotent upsert + flags", () => {
  it("upserts one finding per hit on the natural key with ON CONFLICT DO NOTHING", async () => {
    const captured: Captured = {};
    const res = await runRenewalScan({
      supabase: scanDb(captured, { docs: DB_DOCS, ex: DB_EX }) as never,
      organizationId: "org-1",
      workflowRunId: "run-1",
      config: CONFIG,
      now: NOW,
    });

    expect(res.ok).toBe(true);
    expect(res.output).toEqual({ hits: 3, written: 3 });
    expect(captured.table).toBe("watcher_findings");
    expect(captured.rows).toHaveLength(3);
    // The idempotency mechanism: conflict target = the natural key, ignore dups.
    expect(captured.opts).toEqual({
      onConflict: WATCHER_FINDINGS_CONFLICT_TARGET,
      ignoreDuplicates: true,
    });
    const first = (captured.rows as Array<Record<string, unknown>>)[0];
    expect(first.organization_id).toBe("org-1");
    expect(first.schedule_id).toBe("sch-1");
    expect(first.run_id).toBe("run-1");
    expect(first.finding_kind).toBe("renewal");
    expect(first.is_fixture).toBe(true); // decision 3ii
  });

  it("is idempotent: a repeated observation yields the SAME natural-key rows (the DB dedups them)", async () => {
    const a: Captured = {};
    const b: Captured = {};
    const db = { docs: DB_DOCS, ex: DB_EX };
    await runRenewalScan({ supabase: scanDb(a, db) as never, organizationId: "org-1", workflowRunId: "run-1", config: CONFIG, now: NOW });
    await runRenewalScan({ supabase: scanDb(b, db) as never, organizationId: "org-1", workflowRunId: "run-2", config: CONFIG, now: NOW });

    const key = (r: Record<string, unknown>) =>
      [r.organization_id, r.schedule_id, r.finding_kind, r.subject_ref, r.event_key].join("|");
    const keysA = (a.rows as Array<Record<string, unknown>>).map(key);
    const keysB = (b.rows as Array<Record<string, unknown>>).map(key);
    // Identical natural keys across ticks ⇒ the ON CONFLICT DO NOTHING upsert
    // writes each finding once, no matter how many times it is observed.
    expect(keysB).toEqual(keysA);
    expect(a.opts?.ignoreDuplicates).toBe(true);
  });

  it("skips honestly when there is no schedule/collection context (e.g. a manual run)", async () => {
    const captured: Captured = {};
    const res = await runRenewalScan({
      supabase: scanDb(captured, { docs: DB_DOCS, ex: DB_EX }) as never,
      organizationId: "org-1",
      workflowRunId: "run-1",
      config: { windowDays: 60 }, // no collectionId / scheduleId
      now: NOW,
    });
    expect(res.ok).toBe(true);
    expect(res.output).toEqual({ skipped: true, reason: "No schedule/collection context." });
    expect(captured.rows).toBeUndefined(); // nothing written
  });
});

describe("parseRenewalScanConfig — defensive defaults", () => {
  it("defaults window / kind / attribute keys and coerces junk", () => {
    expect(parseRenewalScanConfig(null)).toEqual({
      collectionId: null,
      scheduleId: null,
      windowDays: 30,
      findingKind: "renewal",
      isFixture: false,
      expiryAttributeKey: "expiration_date",
      autoRenewAttributeKey: "auto_renew",
    });
    const parsed = parseRenewalScanConfig({ collectionId: "c", scheduleId: "s", windowDays: -5, isFixture: true });
    expect(parsed.windowDays).toBe(30); // -5 rejected → default
    expect(parsed.isFixture).toBe(true);
  });
});
