"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserProfile, requireAuthUser } from "@/lib/auth/access";
import {
  parseStructuredQuery,
  type StructuredQuery,
} from "@/lib/deterministic/structured-query";
import {
  getQueryableCollections,
  loadMatchedCitations,
  runCollectionStructuredQuery,
  translateQuestionToQuery,
} from "@/lib/knowledge/structured-query";
import { describeStructuredQuery } from "@/lib/knowledge/structured-query-describe";
import {
  MAX_SHOWN_MATCHES,
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
  type MatchedDocument,
  type PresentedResult,
  type QueryableAttribute,
  type QueryableCollection,
} from "@/lib/knowledge/structured-query-shared";
import type { StructuredQueryResult } from "@/lib/deterministic/structured-query";
import { isUndefinedTableError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for the Structured Query question surface (commit 5): ask a
 * plain-language question, re-run a saved one, delete one. The flow is the
 * feature's spine made explicit — the model TRANSLATES (translateQuestionTo
 * Query), validation + the known-key check GUARD, the pure engine COUNTS
 * (runCollectionStructuredQuery), and the result is persisted as a transparent,
 * re-runnable artifact. The model never touches the count; it only proposes the
 * query, which the user then sees in plain language.
 *
 * Member-facing: a regular user asks over collections they can see (RLS scopes
 * which collections, which schema fields, and which extracted values they reach;
 * defining schemas stays super-admin). The persisted row is owned by the asker
 * (org admins may read it), exactly like a research run.
 */

const SURFACE_PATH = "/workspace/knowledge/structured-query";
const GENERIC_ERROR = "Something went wrong. Please try again.";
const UNPARSEABLE_MESSAGE =
  "I couldn't turn that into an exact query. Try rephrasing, for example: how many agreements are NDAs, or how many auto-renew?";

const askSchema = z.object({
  collectionId: z.string().uuid(),
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

/** Ask a new question over a collection the user can query. */
export async function askStructuredQuestion(input: {
  collectionId: string;
  question: string;
}): Promise<AskResult> {
  const user = await requireAuthUser();
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check your question and collection.",
    };
  }
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const collection = await findQueryableCollection(parsed.data.collectionId);
  if (!collection) return { ok: false, error: "Pick a collection you can query." };
  if (collection.attributes.length === 0) {
    return { ok: false, error: "This collection has no fields to query yet." };
  }

  const outcome = await translateQuestionToQuery({
    question: parsed.data.question,
    attributes: collection.attributes,
    organizationId: profile.organization_id,
    userId: user.id,
  });

  if (outcome.kind === "unparseable") {
    return { ok: false, error: UNPARSEABLE_MESSAGE };
  }

  if (outcome.kind === "gap") {
    // Honest gap: the question named a field the schema does not track. Persist
    // it (the phase-two seam: this row becomes a "track it?" offer later), name
    // what IS available, and return — no query ran.
    const id = await persistGap(
      profile.organization_id,
      user.id,
      collection.id,
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
        availableAttributes: collection.attributes,
      },
    };
  }

  // A translated query: the pure engine counts; the result is persisted.
  const executed = await executeQuery(collection, outcome.query);
  const id = await persistAnswer(
    profile.organization_id,
    user.id,
    collection,
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
      preparationState: collection.preparationState,
    },
  };
}

/**
 * Re-run a saved question's interpreted query over the CURRENT data. The IR is
 * re-validated and the pure engine re-counts, so the answer is byte-identical to
 * the original over unchanged data and honestly updated when the collection has
 * been re-prepared since. This is the concrete "re-runnable, auditable" property.
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

  const collection = await findQueryableCollection(row.collection_id);
  if (!collection) {
    return { ok: false, error: "That collection is no longer available to you." };
  }

  if (!row.understood) {
    return {
      ok: true,
      result: {
        kind: "gap",
        id: row.id,
        question: row.question,
        missingConcept: row.missing_concept ?? "that",
        availableAttributes: collection.attributes,
      },
    };
  }

  const query = parseStructuredQuery(row.interpreted_query);
  if (!query) return { ok: false, error: "That saved query could not be read." };

  const executed = await executeQuery(collection, query);
  // Refresh the stored snapshot so the history reflects the current data.
  await supabase
    .from("structured_queries")
    .update({
      interpreted_summary: executed.interpretedSummary,
      result: executed.result,
      matched_count: executed.result.matched,
      total_count: executed.result.total,
      preparation_state: collection.preparationState,
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
      preparationState: collection.preparationState,
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
// Internals
// ---------------------------------------------------------------------------

type ExecutedQuery = {
  result: StructuredQueryResult;
  matches: MatchedDocument[];
  shownMatches: number;
  totalMatches: number;
  interpretedSummary: string;
};

/** Run the pure engine and assemble the verifiable, plain-language presentation
 * for a translated query. Shared by ask and re-run so the two can never diverge. */
async function executeQuery(
  collection: QueryableCollection,
  query: StructuredQuery,
): Promise<ExecutedQuery> {
  const result = await runCollectionStructuredQuery(collection.id, query);
  const shownIds = [...result.matchedDocumentIds].slice(0, MAX_SHOWN_MATCHES);
  const matches = await loadMatchedCitations(
    collection.id,
    shownIds,
    referencedAttributes(query, collection),
  );
  return {
    result,
    matches,
    shownMatches: shownIds.length,
    totalMatches: result.matched,
    interpretedSummary: describeStructuredQuery(query, labelLookup(collection)),
  };
}

async function findQueryableCollection(
  collectionId: string,
): Promise<QueryableCollection | null> {
  const collections = await getQueryableCollections();
  return collections.find((c) => c.id === collectionId) ?? null;
}

/** The attributes a query references (predicates + group-by), for citations. */
function referencedAttributes(
  query: StructuredQuery,
  collection: QueryableCollection,
): QueryableAttribute[] {
  const keys = new Set<string>();
  for (const predicate of query.predicates) keys.add(predicate.attribute);
  if (query.groupBy !== undefined) keys.add(query.groupBy);
  return collection.attributes.filter((a) => keys.has(a.key));
}

function labelLookup(collection: QueryableCollection): (key: string) => string {
  const byKey = new Map(collection.attributes.map((a) => [a.key, a.label]));
  return (key) => byKey.get(key) ?? key;
}

/** Persist a translated answer; returns its id, or "" when the table is not yet
 * applied (the surface then simply omits re-run for this answer). */
async function persistAnswer(
  organizationId: string,
  userId: string,
  collection: QueryableCollection,
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
      collection_id: collection.id,
      question,
      interpreted_summary: executed.interpretedSummary,
      interpreted_query: query,
      understood: true,
      result: executed.result,
      matched_count: executed.result.matched,
      total_count: executed.result.total,
      preparation_state: collection.preparationState,
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
