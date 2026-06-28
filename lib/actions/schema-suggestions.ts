"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserProfile, requireAuthUser } from "@/lib/auth/access";
import { COLLECTION_ATTRIBUTE_TYPES } from "@/lib/knowledge/collection-schema";
import {
  appendApprovedAttribute,
} from "@/lib/knowledge/schema-suggestions";
import {
  canApproveSchemaSuggestion,
  MAX_PROPOSED_DESCRIPTION_LENGTH,
  MAX_PROPOSED_LABEL_LENGTH,
  type ProposedAttribute,
  type SchemaSuggestionView,
} from "@/lib/knowledge/schema-suggestions-shared";
import {
  draftAttributeDefinition,
  getQueryableCollections,
} from "@/lib/knowledge/structured-query";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Schema-grows-on-demand actions (phase two): a member SUGGESTS tracking a field
 * the collection lacked (a model drafts its definition), and an approver REVIEWS,
 * EDITS, and APPROVES it, which adds the attribute to the schema. The approval
 * authority is the single `canApproveSchemaSuggestion` gate — enforced here, with
 * the gated schema write done via the service role, so changing who may approve
 * touches only that one function.
 *
 * Approving never extracts: it bumps the schema version, which (by commit 3's
 * derived staleness) flips the collection to "needs updating". The admin then
 * runs the deliberate Update, exactly as for any other schema edit — cost stays
 * a deliberate choice.
 */

const STRUCTURED_QUERY_PATH = "/workspace/knowledge/structured-query";
// Curated-collection management moved to Policy & access (Phase B); revalidate there.
const COLLECTIONS_PATH = "/workspace/admin/policy";
const GENERIC_ERROR = "Something went wrong. Please try again.";
const NOT_ALLOWED = "Only an administrator can approve a suggested field.";

const suggestSchema = z.object({
  collectionId: z.string().uuid(),
  question: z.string().trim().min(1).max(400),
  missingConcept: z.string().trim().min(1).max(120),
});

const proposedSchema = z.object({
  label: z.string().trim().min(1, "A field needs a name.").max(MAX_PROPOSED_LABEL_LENGTH),
  type: z.enum(COLLECTION_ATTRIBUTE_TYPES),
  description: z
    .string()
    .trim()
    .min(1, "Describe what to extract.")
    .max(MAX_PROPOSED_DESCRIPTION_LENGTH),
  options: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
});

const approveSchema = z.object({
  suggestionId: z.string().uuid(),
  proposed: proposedSchema,
});
const idSchema = z.string().uuid();

export type SuggestResult =
  | { ok: true; suggestion: SchemaSuggestionView }
  | { ok: false; error: string };
export type ResolveResult =
  | { ok: true; attributeLabel?: string }
  | { ok: false; error: string };

/** Suggest tracking a missing field. Any member who can see the collection may
 * suggest; a model drafts the proposed definition for an approver to review. */
export async function suggestSchemaAttribute(input: {
  collectionId: string;
  question: string;
  missingConcept: string;
}): Promise<SuggestResult> {
  const user = await requireAuthUser();
  const parsed = suggestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  // The collection must be one the member can query (visible + has a schema);
  // its existing attributes inform the draft so it does not duplicate a field.
  const collection = (await getQueryableCollections()).find(
    (c) => c.id === parsed.data.collectionId,
  );
  if (!collection) return { ok: false, error: "Pick a collection you can query." };

  const drafted = await draftAttributeDefinition({
    question: parsed.data.question,
    missingConcept: parsed.data.missingConcept,
    existing: collection.attributes,
    organizationId: profile.organization_id,
    userId: user.id,
  });
  const proposed = drafted ?? fallbackProposed(parsed.data.missingConcept);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("attribute_suggestions")
    .insert({
      organization_id: profile.organization_id,
      collection_id: collection.id,
      suggested_by_user_id: user.id,
      source_question: parsed.data.question,
      missing_concept: parsed.data.missingConcept,
      proposed,
      status: "pending",
    })
    .select("id, created_at")
    .single();
  if (error || !data) {
    console.error("attribute_suggestions insert failed", { code: (error as { code?: string })?.code });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(STRUCTURED_QUERY_PATH);
  const row = data as { id: string; created_at: string };
  return {
    ok: true,
    suggestion: {
      id: row.id,
      collectionId: collection.id,
      collectionName: collection.name,
      sourceQuestion: parsed.data.question,
      missingConcept: parsed.data.missingConcept,
      proposed,
      status: "pending",
      suggestedByYou: true,
      canApprove: canApproveSchemaSuggestion(profile, { id: collection.id }),
      resultingAttributeLabel: null,
      createdAt: row.created_at,
    },
  };
}

/** Approve a suggestion with the (possibly edited) definition: adds the
 * attribute to the schema and marks the collection needs-updating. */
export async function approveSchemaSuggestion(input: {
  suggestionId: string;
  proposed: ProposedAttribute;
}): Promise<ResolveResult> {
  const user = await requireAuthUser();
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const suggestion = await loadPendingSuggestion(parsed.data.suggestionId, profile.organization_id);
  if (!suggestion) return { ok: false, error: "That suggestion is no longer pending." };

  // THE GATE. Changing who may approve is a one-line edit in
  // canApproveSchemaSuggestion; nothing else here decides authority.
  if (!canApproveSchemaSuggestion(profile, { id: suggestion.collectionId })) {
    return { ok: false, error: NOT_ALLOWED };
  }

  const appended = await appendApprovedAttribute({
    collectionId: suggestion.collectionId,
    organizationId: profile.organization_id,
    proposed: parsed.data.proposed,
  });
  if (!appended.ok) return { ok: false, error: appended.error };

  // Record the resolution (service role; the gate already authorized this).
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("attribute_suggestions")
    .update({
      status: "approved",
      resolved_by_user_id: user.id,
      resulting_attribute_key: appended.attributeKey,
      proposed: parsed.data.proposed,
    })
    .eq("id", suggestion.id);
  if (error) {
    console.error("attribute_suggestions approve update failed", { code: error.code });
    // The attribute IS added; report success so the admin isn't told to retry.
  }

  revalidatePath(STRUCTURED_QUERY_PATH);
  revalidatePath(COLLECTIONS_PATH); // the collection now reads "needs updating"
  return { ok: true, attributeLabel: appended.attributeLabel };
}

/** Reject a suggestion (gated identically). */
export async function rejectSchemaSuggestion(suggestionId: string): Promise<ResolveResult> {
  const user = await requireAuthUser();
  const parsedId = idSchema.safeParse(suggestionId);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const suggestion = await loadPendingSuggestion(parsedId.data, profile.organization_id);
  if (!suggestion) return { ok: false, error: "That suggestion is no longer pending." };
  if (!canApproveSchemaSuggestion(profile, { id: suggestion.collectionId })) {
    return { ok: false, error: NOT_ALLOWED };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("attribute_suggestions")
    .update({ status: "rejected", resolved_by_user_id: user.id })
    .eq("id", suggestion.id);
  if (error) return { ok: false, error: GENERIC_ERROR };

  revalidatePath(STRUCTURED_QUERY_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Load a pending suggestion in the caller's org (service role; the action
 * applies the gate). Returns null when missing, resolved, or cross-org. */
async function loadPendingSuggestion(
  suggestionId: string,
  organizationId: string,
): Promise<{ id: string; collectionId: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("attribute_suggestions")
    .select("id, collection_id, organization_id, status")
    .eq("id", suggestionId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    id: string;
    collection_id: string;
    organization_id: string;
    status: string;
  };
  if (row.organization_id !== organizationId || row.status !== "pending") return null;
  return { id: row.id, collectionId: row.collection_id };
}

/** A minimal editable draft when the model produced nothing usable — a human
 * owns the final wording regardless, so the flow never dead-ends. */
function fallbackProposed(missingConcept: string): ProposedAttribute {
  const label = missingConcept.trim().slice(0, MAX_PROPOSED_LABEL_LENGTH) || "New field";
  return {
    label,
    type: "text",
    description: `What each document says about ${label.toLowerCase()}.`,
  };
}
