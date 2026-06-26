import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import {
  collectionAttributesSchema,
  makeUniqueAttributeKey,
  parseCollectionAttributes,
  type CollectionAttribute,
} from "@/lib/knowledge/collection-schema";
import {
  canApproveSchemaSuggestion,
  type ProposedAttribute,
  type SchemaSuggestionView,
} from "@/lib/knowledge/schema-suggestions-shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUndefinedTableError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server reads + the gated schema append for schema-grows-on-demand (phase two).
 * The approval AUTHORITY is `canApproveSchemaSuggestion` (the single code gate in
 * schema-suggestions-shared.ts); this module enforces it for the append and uses
 * the service role for the gated write, so the gate is the only thing to change
 * to alter who may grow a schema.
 */

/** Defensive read of a stored `proposed` jsonb into a `ProposedAttribute`. */
function parseProposed(value: unknown): ProposedAttribute | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.label !== "string" || typeof o.description !== "string") return null;
  const proposed: ProposedAttribute = {
    label: o.label,
    type:
      o.type === "number" || o.type === "date" || o.type === "boolean" || o.type === "enum"
        ? o.type
        : "text",
    description: o.description,
  };
  if (proposed.type === "enum" && Array.isArray(o.options)) {
    const options = o.options.filter((x): x is string => typeof x === "string");
    if (options.length > 0) proposed.options = options;
  }
  return proposed;
}

/**
 * The suggestions a viewer should see: pending and approved ones for collections
 * they can see (rejected drop off), newest first. `canApprove` and
 * `suggestedByYou` are computed per row from the single gate and the current
 * user. Tolerant of the pre-migration window (absent table → empty).
 */
export async function listSchemaSuggestions(limit = 25): Promise<SchemaSuggestionView[]> {
  const profile = await getCurrentUserProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("attribute_suggestions")
    .select(
      "id, collection_id, source_question, missing_concept, proposed, status, resulting_attribute_key, suggested_by_user_id, created_at, collections(name)",
    )
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!isUndefinedTableError(error)) {
      console.error("attribute_suggestions read failed", { code: error.code });
    }
    return [];
  }

  const views: SchemaSuggestionView[] = [];
  for (const raw of data ?? []) {
    const r = raw as unknown as {
      id: string;
      collection_id: string;
      source_question: string;
      missing_concept: string;
      proposed: unknown;
      status: "pending" | "approved" | "rejected";
      resulting_attribute_key: string | null;
      suggested_by_user_id: string;
      created_at: string;
      collections: { name: string } | null;
    };
    const proposed = parseProposed(r.proposed);
    if (!proposed) continue;
    views.push({
      id: r.id,
      collectionId: r.collection_id,
      collectionName: r.collections?.name ?? "a collection",
      sourceQuestion: r.source_question,
      missingConcept: r.missing_concept,
      proposed,
      status: r.status,
      suggestedByYou: profile?.id === r.suggested_by_user_id,
      canApprove: canApproveSchemaSuggestion(profile, { id: r.collection_id }),
      resultingAttributeLabel: r.status === "approved" ? proposed.label : null,
      createdAt: r.created_at,
    });
  }
  return views;
}

/**
 * Append an approved attribute to a collection's schema, via the SAME validated
 * commit-2 path (stable-key derivation, the zod boundary, the version bump). The
 * version bump is what makes the new attribute universally stale (commit 3's
 * derived staleness), flipping the collection to "needs updating" — no new
 * extraction machinery. Uses the service role: the caller (the approve action)
 * has already enforced `canApproveSchemaSuggestion`, so this write is governed by
 * that gate, not by the super-admin RLS on collection_schemas.
 */
export async function appendApprovedAttribute(args: {
  collectionId: string;
  organizationId: string;
  proposed: ProposedAttribute;
}): Promise<
  | { ok: true; attributeKey: string; attributeLabel: string }
  | { ok: false; error: string }
> {
  const { collectionId, organizationId, proposed } = args;
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("collection_schemas")
    .select("id, version, attributes")
    .eq("collection_id", collectionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "This collection has no schema to extend." };
  }
  const row = data as { id: string; version: number; attributes: unknown };
  const existing = parseCollectionAttributes(row.attributes);

  const key = makeUniqueAttributeKey(
    proposed.label,
    existing.map((a) => a.key),
  );
  const newAttribute: CollectionAttribute = {
    key,
    label: proposed.label,
    type: proposed.type,
    description: proposed.description,
    ...(proposed.type === "enum" && proposed.options && proposed.options.length > 0
      ? { options: proposed.options }
      : {}),
  };

  const parsed = collectionAttributesSchema.safeParse([...existing, newAttribute]);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "The attribute could not be added.",
    };
  }

  const { error: updateError } = await admin
    .from("collection_schemas")
    .update({ attributes: parsed.data, version: (row.version ?? 1) + 1 })
    .eq("id", row.id);
  if (updateError) {
    console.error("schema append update failed", { code: updateError.code });
    return { ok: false, error: "Could not add the attribute. Please try again." };
  }

  return { ok: true, attributeKey: key, attributeLabel: newAttribute.label };
}
