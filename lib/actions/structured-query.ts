"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserProfile, requireAuthUser } from "@/lib/auth/access";
import {
  canSetUpFolders,
  ensureFolderCollection,
} from "@/lib/actions/collections";
import {
  collectionAttributesSchema,
} from "@/lib/knowledge/collection-schema";
import type { FolderDescriptor } from "@/lib/knowledge/collections-shared";
import {
  parseStructuredQuery,
  type StructuredQuery,
} from "@/lib/deterministic/structured-query";
import { groupFoldersByKind, type QueryFolder } from "@/lib/knowledge/document-kinds";
import {
  getStructuredQueryFolders,
  loadMatchedCitations,
  resolveKindByCollectionId,
  resolveKindBySchemaId,
  runCollectionStructuredQuery,
  translateQuestionToQuery,
} from "@/lib/knowledge/structured-query";
import { describeStructuredQuery } from "@/lib/knowledge/structured-query-describe";
import {
  MAX_SHOWN_MATCHES,
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
  type DocumentKindSummary,
  type MatchedDocument,
  type PresentedResult,
  type QueryableAttribute,
  type QueryableKind,
} from "@/lib/knowledge/structured-query-shared";
import type { StructuredQueryResult } from "@/lib/deterministic/structured-query";
import { isUndefinedTableError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for the Structured Query question surface. On the Step 3b
 * per-set foundation, an ask is scoped to a document KIND, not a single folder:
 * the surface picks folders, those resolve to the kind(s) they share, and a
 * question runs across EVERY visible folder of the chosen kind. The flow is the
 * feature's spine made explicit — the model TRANSLATES, validation + the
 * known-key check GUARD, the pure engine COUNTS, and the result is persisted as a
 * transparent, re-runnable artifact (a representative folder id is stored, so a
 * re-run re-resolves the same kind over current data). The model never touches
 * the count; it only proposes the query, which the user then sees in plain
 * language.
 *
 * Plus the Step 3b GUIDED-DEPTH setup actions (super admin, the single
 * `canSetUpFolders` gate): add folders from a drive, reuse an existing kind, or
 * define a new one. Members ask over kinds an admin has set up.
 */

const SURFACE_PATH = "/workspace/knowledge/structured-query";
const GENERIC_ERROR = "Something went wrong. Please try again.";
const NOT_ALLOWED = "Only super admins can set up document kinds.";
const UNPARSEABLE_MESSAGE =
  "I couldn't turn that into an exact query. Try rephrasing, for example: how many agreements expire in 2026, or how many auto-renew?";

const askSchema = z.object({
  schemaId: z.string().uuid(),
  question: z
    .string()
    .trim()
    .min(QUESTION_MIN_LENGTH, "Ask a fuller question.")
    .max(QUESTION_MAX_LENGTH),
});
const idSchema = z.string().uuid();

export type AskResult =
  | { ok: true; result: PresentedResult }
  | { ok: false; error: string };

/** Ask a new question over a document KIND the user can query. */
export async function askStructuredQuestion(input: {
  schemaId: string;
  question: string;
}): Promise<AskResult> {
  const user = await requireAuthUser();
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check your question and scope.",
    };
  }
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const kind = await resolveKindBySchemaId(parsed.data.schemaId);
  if (!kind) return { ok: false, error: "Pick a document kind you can ask about." };
  if (kind.attributes.length === 0) {
    return { ok: false, error: "This document kind has no fields to query yet." };
  }

  const outcome = await translateQuestionToQuery({
    question: parsed.data.question,
    attributes: kind.attributes,
    organizationId: profile.organization_id,
    userId: user.id,
  });

  if (outcome.kind === "unparseable") {
    return { ok: false, error: UNPARSEABLE_MESSAGE };
  }

  if (outcome.kind === "gap") {
    // Honest gap: the question named a field the kind does not track. Persist it
    // (the phase-two seam: this row becomes a "track it?" offer), name what IS
    // available, and return — no query ran.
    const id = await persistGap(
      profile.organization_id,
      user.id,
      kind.representativeCollectionId,
      parsed.data.question,
      outcome.missing,
    );
    revalidatePath(SURFACE_PATH);
    return {
      ok: true,
      result: {
        kind: "gap",
        id,
        question: parsed.data.question,
        missingConcept: outcome.missing,
        availableAttributes: kind.attributes,
      },
    };
  }

  // A translated query: the pure engine counts over the kind's folder set; the
  // result is persisted against a representative folder.
  const executed = await executeQuery(kind, outcome.query);
  const id = await persistAnswer(
    profile.organization_id,
    user.id,
    kind,
    parsed.data.question,
    outcome.query,
    executed,
  );
  revalidatePath(SURFACE_PATH);
  return {
    ok: true,
    result: {
      kind: "answer",
      id,
      question: parsed.data.question,
      interpretedSummary: executed.interpretedSummary,
      result: executed.result,
      matches: executed.matches,
      shownMatches: executed.shownMatches,
      totalMatches: executed.totalMatches,
      preparationState: kind.preparationState,
    },
  };
}

/**
 * Re-run a saved question's interpreted query over the CURRENT data. The saved
 * representative folder re-resolves to its kind (reflecting any folders added to
 * or removed from the kind since), the IR is re-validated, and the pure engine
 * re-counts — byte-identical over unchanged data, honestly updated otherwise.
 */
export async function rerunStructuredQuery(id: string): Promise<AskResult> {
  await requireAuthUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("structured_queries")
    .select("id, question, collection_id, understood, interpreted_query, missing_concept")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "That question is no longer available." };
  const row = data as {
    id: string;
    question: string;
    collection_id: string;
    understood: boolean;
    interpreted_query: unknown;
    missing_concept: string | null;
  };

  const kind = await resolveKindByCollectionId(row.collection_id);
  if (!kind) {
    return { ok: false, error: "That document kind is no longer available to you." };
  }

  if (!row.understood) {
    return {
      ok: true,
      result: {
        kind: "gap",
        id: row.id,
        question: row.question,
        missingConcept: row.missing_concept ?? "that",
        availableAttributes: kind.attributes,
      },
    };
  }

  const query = parseStructuredQuery(row.interpreted_query);
  if (!query) return { ok: false, error: "That saved query could not be read." };

  const executed = await executeQuery(kind, query);
  // Refresh the stored snapshot so the history reflects the current data.
  await supabase
    .from("structured_queries")
    .update({
      interpreted_summary: executed.interpretedSummary,
      result: executed.result,
      matched_count: executed.result.matched,
      total_count: executed.result.total,
      preparation_state: kind.preparationState,
    })
    .eq("id", row.id);
  revalidatePath(SURFACE_PATH);

  return {
    ok: true,
    result: {
      kind: "answer",
      id: row.id,
      question: row.question,
      interpretedSummary: executed.interpretedSummary,
      result: executed.result,
      matches: executed.matches,
      shownMatches: executed.shownMatches,
      totalMatches: executed.totalMatches,
      preparationState: kind.preparationState,
    },
  };
}

/** Delete a saved question (owner only, enforced by RLS). */
export async function deleteStructuredQuery(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuthUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("structured_queries")
    .delete()
    .eq("id", parsedId.data);
  if (error) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(SURFACE_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Guided-depth setup (super admin; the single canSetUpFolders gate)
// ---------------------------------------------------------------------------

const addFoldersSchema = z.object({
  folders: z
    .array(
      z.object({
        connectionId: z.string().uuid(),
        rootReference: z.string().min(1).max(1024),
        pathNames: z.array(z.string()).max(64),
        recursive: z.boolean(),
        displayName: z.string().max(500),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * Folder-picking in Structured Query (Step 3b): find-or-create the invisible
 * folder-backed collection for each picked folder, then return them as folder
 * views the surface can select. Gated by `ensureFolderCollection` (the single
 * `canSetUpFolders` gate; the admin path). The engine and data model are
 * unchanged; this only resolves picked folders into ids the ask flow accepts.
 */
export async function addStructuredQueryFolders(input: {
  folders: FolderDescriptor[];
}): Promise<{ ok: true; folders: QueryFolder[] } | { ok: false; error: string }> {
  await requireAuthUser();
  const parsed = addFoldersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  const ids: string[] = [];
  for (const folder of parsed.data.folders) {
    const result = await ensureFolderCollection({
      connectionId: folder.connectionId,
      rootReference: folder.rootReference,
      pathNames: folder.pathNames,
      recursive: folder.recursive,
    });
    if (!result.ok) return { ok: false, error: result.error };
    if (result.collectionId) ids.push(result.collectionId);
  }

  const visible = await getStructuredQueryFolders();
  return { ok: true, folders: visible.filter((f) => ids.includes(f.id)) };
}

/** The existing kinds an admin can point folders at (reuse-led setup). */
export async function listDocumentKinds(): Promise<DocumentKindSummary[]> {
  await requireAuthUser();
  if (!(await canSetUpFolders())) return [];
  const folders = await getStructuredQueryFolders();
  return groupFoldersByKind(folders)
    .filter((group) => group.hasSchema && group.schemaId !== null)
    .map((group) => ({
      schemaId: group.schemaId as string,
      schemaName: group.schemaName ?? "Untitled kind",
      fieldLabels: group.attributes.map((a) => a.label),
      folderCount: group.folderIds.length,
    }));
}

const pointSchema = z.object({
  collectionIds: z.array(z.string().uuid()).min(1).max(50),
  schemaId: z.string().uuid(),
});

/**
 * Point the chosen folders at an existing kind (super admin). Confirms the kind
 * is one the admin's org can see (RLS scopes the read), then sets each folder's
 * `schema_id`. A no-op-safe write: pointing a folder already on the kind is fine.
 */
export async function pointFoldersAtKind(input: {
  collectionIds: string[];
  schemaId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuthUser();
  if (!(await canSetUpFolders())) return { ok: false, error: NOT_ALLOWED };
  const parsed = pointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  const supabase = await createSupabaseServerClient();
  const { data: schema, error: schemaError } = await supabase
    .from("collection_schemas")
    .select("id")
    .eq("id", parsed.data.schemaId)
    .maybeSingle();
  if (schemaError) return { ok: false, error: GENERIC_ERROR };
  if (!schema) return { ok: false, error: "That document kind isn't available." };

  const { error } = await supabase
    .from("collections")
    .update({ schema_id: parsed.data.schemaId })
    .in("id", parsed.data.collectionIds);
  if (error) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(SURFACE_PATH);
  return { ok: true };
}

const createKindSchema = z.object({
  name: z.string().trim().min(1, "Name the document kind.").max(120),
  attributes: collectionAttributesSchema,
  collectionIds: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * Define a NEW kind and point the chosen folders at it (super admin). Creates
 * one `collection_schemas` entity (named, the per-set home is the first folder)
 * and sets `schema_id` on every chosen folder, so the whole set shares the kind
 * and is extracted once. Mirrors `saveCollectionSchema`'s insert branch, widened
 * to a set. The attributes are validated at this write boundary; the RLS policy
 * re-enforces super-admin-in-org at the database (the established double-gate).
 */
export async function createDocumentKind(input: {
  name: string;
  attributes: unknown;
  collectionIds: string[];
}): Promise<{ ok: true; schemaId: string } | { ok: false; error: string }> {
  await requireAuthUser();
  if (!(await canSetUpFolders())) return { ok: false, error: NOT_ALLOWED };
  const parsed = createKindSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the kind and try again.",
    };
  }
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase
    .from("collection_schemas")
    .insert({
      collection_id: parsed.data.collectionIds[0],
      organization_id: profile.organization_id,
      name: parsed.data.name,
      attributes: parsed.data.attributes,
      created_by_user_id: profile.id,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: GENERIC_ERROR };
  const schemaId = (created as { id: string }).id;

  const { error: pointError } = await supabase
    .from("collections")
    .update({ schema_id: schemaId })
    .in("id", parsed.data.collectionIds);
  if (pointError) return { ok: false, error: GENERIC_ERROR };

  revalidatePath(SURFACE_PATH);
  return { ok: true, schemaId };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ExecutedQuery = {
  result: StructuredQueryResult;
  matches: MatchedDocument[];
  shownMatches: number;
  totalMatches: number;
  interpretedSummary: string;
};

/** Run the pure engine over the kind's folder set and assemble the verifiable,
 * plain-language presentation. Shared by ask and re-run so they can never
 * diverge. */
async function executeQuery(
  kind: QueryableKind,
  query: StructuredQuery,
): Promise<ExecutedQuery> {
  const result = await runCollectionStructuredQuery(kind.folderIds, query);
  const shownIds = [...result.matchedDocumentIds].slice(0, MAX_SHOWN_MATCHES);
  const matches = await loadMatchedCitations(
    kind.folderIds,
    shownIds,
    referencedAttributes(query, kind.attributes),
  );
  return {
    result,
    matches,
    shownMatches: shownIds.length,
    totalMatches: result.matched,
    interpretedSummary: describeStructuredQuery(query, labelLookup(kind.attributes)),
  };
}

/** The attributes a query references (predicates + group-by), for citations. */
function referencedAttributes(
  query: StructuredQuery,
  attributes: QueryableAttribute[],
): QueryableAttribute[] {
  const keys = new Set<string>();
  for (const predicate of query.predicates) keys.add(predicate.attribute);
  if (query.groupBy !== undefined) keys.add(query.groupBy);
  return attributes.filter((a) => keys.has(a.key));
}

function labelLookup(attributes: QueryableAttribute[]): (key: string) => string {
  const byKey = new Map(attributes.map((a) => [a.key, a.label]));
  return (key) => byKey.get(key) ?? key;
}

/** Persist a translated answer; returns its id, or "" when the table is not yet
 * applied (the surface then simply omits re-run for this answer). */
async function persistAnswer(
  organizationId: string,
  userId: string,
  kind: QueryableKind,
  question: string,
  query: StructuredQuery,
  executed: ExecutedQuery,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("structured_queries")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      collection_id: kind.representativeCollectionId,
      question,
      interpreted_summary: executed.interpretedSummary,
      interpreted_query: query,
      understood: true,
      result: executed.result,
      matched_count: executed.result.matched,
      total_count: executed.result.total,
      preparation_state: kind.preparationState,
    })
    .select("id")
    .single();
  if (error) {
    if (!isUndefinedTableError(error)) {
      console.error("structured_queries answer insert failed", { code: error.code });
    }
    return "";
  }
  return (data as { id: string }).id;
}

/** Persist an honest gap (no query ran); returns its id, or "" pre-migration. */
async function persistGap(
  organizationId: string,
  userId: string,
  collectionId: string,
  question: string,
  missing: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("structured_queries")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      collection_id: collectionId,
      question,
      understood: false,
      missing_concept: missing,
    })
    .select("id")
    .single();
  if (error) {
    if (!isUndefinedTableError(error)) {
      console.error("structured_queries gap insert failed", { code: error.code });
    }
    return "";
  }
  return (data as { id: string }).id;
}
