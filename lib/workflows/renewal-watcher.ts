import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runStructuredQuery,
  type ExtractedAttributeValue,
  type StructuredQuery,
} from "@/lib/deterministic/structured-query";
import type { CollectionAttributeType } from "@/lib/knowledge/collection-schema";
import { isUndefinedTableError } from "@/lib/supabase/errors";

/**
 * The renewal watcher's deterministic effect (watcher arc, Stage 2, D-221).
 *
 * Its job: find "agreements expiring within N days" over a prepared collection's
 * extracted values, and write ONE idempotent finding per hit (decision 1b). The
 * MATCH is deterministic — the pure Structured Query engine (D-200) filters a
 * `date_between(today, today+N)` predicate, so which agreements are due is code,
 * not a model's judgment. This runs INSIDE a workflow step through
 * executeWorkflowRunWith (decision 4a), never as a cron shortcut.
 *
 * The compute (`computeRenewalFindings`) is pure + injected-clock, so per-hit and
 * window behaviour are unit-tested without a DB. The scan (`runRenewalScan`) is
 * the thin impure boundary: it loads extracted values through the passed
 * service-role client and upserts findings on the natural key
 * (ON CONFLICT DO NOTHING — decision 2), never throwing.
 */

/**
 * The DB client the scan reads/writes through — the service-role admin client in
 * production (the cron has no session), or the passed run client. Typed as the
 * base SupabaseClient so both the admin and server clients satisfy it; tests pass
 * a lightweight fake cast to it.
 */
type WatcherDbClient = SupabaseClient;

/** A finding the watcher would record (before it is stamped with org/schedule/run). */
export type RenewalFindingDraft = {
  subjectRef: string;
  eventKey: string;
  title: string;
  body: string;
};

/** The natural-key column list for watcher_findings, shared by the upsert. */
export const WATCHER_FINDINGS_CONFLICT_TARGET =
  "organization_id,schedule_id,finding_kind,subject_ref,event_key";

/** ISO calendar date (YYYY-MM-DD) for a Date, in UTC (matches value_date storage). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * PURE: given the collection's extracted values + document titles, the current
 * time, and a window, return one finding draft per agreement expiring within the
 * window. Deterministic (the pure engine decides the match; `now` is injected).
 */
export function computeRenewalFindings(params: {
  rows: ExtractedAttributeValue[];
  titleByDoc: Map<string, string>;
  now: Date;
  windowDays: number;
  expiryAttributeKey: string;
  autoRenewAttributeKey: string;
}): RenewalFindingDraft[] {
  const { rows, titleByDoc, now, windowDays, expiryAttributeKey, autoRenewAttributeKey } = params;

  const today = isoDate(now);
  const cutoff = isoDate(new Date(now.getTime() + windowDays * 86_400_000));

  // Deterministic match: agreements whose expiry falls in [today, today+N].
  const query: StructuredQuery = {
    match: "all",
    predicates: [
      { kind: "date_between", attribute: expiryAttributeKey, min: today, max: cutoff },
    ],
  };
  const result = runStructuredQuery(rows, query);

  // Index the values the finding text needs, per document.
  const expiryByDoc = new Map<string, string>();
  const autoRenewByDoc = new Map<string, boolean>();
  for (const r of rows) {
    if (!r.found) continue;
    if (r.attributeKey === expiryAttributeKey && r.valueDate) {
      expiryByDoc.set(r.documentId, r.valueDate);
    } else if (r.attributeKey === autoRenewAttributeKey && r.valueBoolean !== null) {
      autoRenewByDoc.set(r.documentId, r.valueBoolean);
    }
  }

  const drafts: RenewalFindingDraft[] = [];
  for (const docId of result.matchedDocumentIds) {
    const expiry = expiryByDoc.get(docId);
    if (!expiry) continue; // matched on the date predicate ⇒ always present; defensive.
    const title = (titleByDoc.get(docId) ?? "").trim() || "Untitled agreement";
    const autoRenews = autoRenewByDoc.get(docId) === true;
    drafts.push({
      subjectRef: docId,
      // A changed expiry date is a new event ⇒ a new finding, never a silent overwrite.
      eventKey: `expires_${expiry}`,
      title: `${title} expires ${expiry}`,
      body: autoRenews
        ? `This agreement is set to expire on ${expiry}, within ${windowDays} days. It is marked auto-renew, so confirm whether to let it renew or act before the deadline.`
        : `This agreement is set to expire on ${expiry}, within ${windowDays} days. Review whether to renew or let it lapse.`,
    });
  }
  return drafts;
}

const ATTRIBUTE_TYPE_SET = new Set<string>(["text", "number", "date", "boolean", "enum"]);
function toAttributeType(value: string): CollectionAttributeType {
  return ATTRIBUTE_TYPE_SET.has(value) ? (value as CollectionAttributeType) : "text";
}

/** Parsed, defensively-typed config the watcher reads from the run input jsonb. */
export type RenewalScanConfig = {
  collectionId: string | null;
  scheduleId: string | null;
  windowDays: number;
  findingKind: string;
  isFixture: boolean;
  expiryAttributeKey: string;
  autoRenewAttributeKey: string;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Parse the untrusted run-input config into a typed, defaulted shape. */
export function parseRenewalScanConfig(raw: unknown): RenewalScanConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    collectionId: str(c.collectionId),
    scheduleId: str(c.scheduleId),
    windowDays: num(c.windowDays, 30),
    findingKind: str(c.findingKind) ?? "renewal",
    isFixture: c.isFixture === true,
    expiryAttributeKey: str(c.expiryAttributeKey) ?? "expiration_date",
    autoRenewAttributeKey: str(c.autoRenewAttributeKey) ?? "auto_renew",
  };
}

export type RenewalScanOutput =
  | { skipped: true; reason: string }
  | { hits: number; written: number };

/**
 * IMPURE: load the collection's prepared values through the passed (service-role)
 * client, compute the findings, and upsert them idempotently. Never throws — a
 * failure resolves to a typed { ok:false } the engine records as a failed step.
 */
export async function runRenewalScan(params: {
  supabase: WatcherDbClient;
  organizationId: string;
  workflowRunId: string;
  config: unknown;
  now?: Date;
}): Promise<{ ok: boolean; output: RenewalScanOutput; error?: string }> {
  const { supabase, organizationId, workflowRunId } = params;
  const cfg = parseRenewalScanConfig(params.config);

  // No schedule/collection context (e.g. a manual run) ⇒ nothing to write. The
  // finding's schedule_id is NOT NULL, so a run without a schedule cannot record.
  if (!cfg.collectionId || !cfg.scheduleId) {
    return { ok: true, output: { skipped: true, reason: "No schedule/collection context." } };
  }

  try {
    // The collection's present, anchored documents (id + title for the finding).
    const invRes = await supabase
      .from("collection_documents")
      .select("document_id, title")
      .eq("collection_id", cfg.collectionId)
      .eq("status", "present")
      .not("document_id", "is", null);
    if (invRes.error) {
      return { ok: false, output: { hits: 0, written: 0 }, error: "Could not read the collection inventory." };
    }
    const inv = (invRes.data ?? []) as Array<{ document_id: string | null; title: string | null }>;
    const titleByDoc = new Map<string, string>();
    const docIds: string[] = [];
    for (const r of inv) {
      if (!r.document_id) continue;
      if (!titleByDoc.has(r.document_id)) docIds.push(r.document_id);
      titleByDoc.set(r.document_id, r.title ?? "");
    }
    if (docIds.length === 0) return { ok: true, output: { hits: 0, written: 0 } };

    // The extracted values for those documents (the pure engine's input subset).
    const exRes = await supabase
      .from("document_extractions")
      .select(
        "document_id, attribute_key, attribute_type, found, value_text, value_number, value_date, value_boolean, citation_verified, source_read_incomplete",
      )
      .in("document_id", docIds);
    if (exRes.error) {
      if (isUndefinedTableError(exRes.error)) {
        return { ok: true, output: { hits: 0, written: 0 } };
      }
      return { ok: false, output: { hits: 0, written: 0 }, error: "Could not read extracted values." };
    }
    const rows: ExtractedAttributeValue[] = ((exRes.data ?? []) as Array<Record<string, unknown>>).map(
      (r) => ({
        documentId: r.document_id as string,
        attributeKey: r.attribute_key as string,
        attributeType: toAttributeType(r.attribute_type as string),
        found: r.found as boolean,
        valueText: (r.value_text as string | null) ?? null,
        valueNumber: (r.value_number as number | null) ?? null,
        valueDate: (r.value_date as string | null) ?? null,
        valueBoolean: (r.value_boolean as boolean | null) ?? null,
        citationVerified: r.citation_verified as boolean,
        sourceReadIncomplete: r.source_read_incomplete as boolean,
      }),
    );

    const drafts = computeRenewalFindings({
      rows,
      titleByDoc,
      now: params.now ?? new Date(),
      windowDays: cfg.windowDays,
      expiryAttributeKey: cfg.expiryAttributeKey,
      autoRenewAttributeKey: cfg.autoRenewAttributeKey,
    });
    if (drafts.length === 0) return { ok: true, output: { hits: 0, written: 0 } };

    const findingRows = drafts.map((d) => ({
      organization_id: organizationId,
      schedule_id: cfg.scheduleId,
      run_id: workflowRunId,
      finding_kind: cfg.findingKind,
      subject_ref: d.subjectRef,
      event_key: d.eventKey,
      title: d.title,
      body: d.body,
      is_fixture: cfg.isFixture,
    }));

    // Idempotent (decision 2): a repeated observation collides on the natural key
    // and is skipped (ON CONFLICT DO NOTHING).
    const upRes = await supabase
      .from("watcher_findings")
      .upsert(findingRows, {
        onConflict: WATCHER_FINDINGS_CONFLICT_TARGET,
        ignoreDuplicates: true,
      });
    if (upRes.error) {
      return { ok: false, output: { hits: drafts.length, written: 0 }, error: "Could not record findings." };
    }
    return { ok: true, output: { hits: drafts.length, written: drafts.length } };
  } catch {
    return { ok: false, output: { hits: 0, written: 0 }, error: "The renewal scan failed." };
  }
}
