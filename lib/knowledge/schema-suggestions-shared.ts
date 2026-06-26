import type { CollectionAttributeType } from "@/lib/knowledge/collection-schema";

/**
 * Shared types and the SINGLE approval gate for schema-grows-on-demand (phase
 * two). Imported by both server (the actions + data layer) and client (the
 * review UI), so this module is free of "server-only" and holds only types and
 * the one pure gate function.
 */

export type SuggestionStatus = "pending" | "approved" | "rejected";

/** A proposed (or admin-edited) attribute definition — the commit-2 attribute
 * shape MINUS the key (the key is derived at approval, label-edit-safe). */
export type ProposedAttribute = {
  label: string;
  type: CollectionAttributeType;
  description: string;
  options?: string[];
};

/** One suggestion as a surface renders it. `canApprove` and `suggestedByYou`
 * are computed per-viewer in the data layer (the gate + the current user id). */
export type SchemaSuggestionView = {
  id: string;
  collectionId: string;
  collectionName: string;
  sourceQuestion: string;
  missingConcept: string;
  proposed: ProposedAttribute;
  status: SuggestionStatus;
  /** True when the current user is the suggester. */
  suggestedByYou: boolean;
  /** True when the current user may approve/reject this suggestion (the gate). */
  canApprove: boolean;
  /** The human label the attribute received in the schema, once approved. */
  resultingAttributeLabel: string | null;
  createdAt: string;
};

// Draft / edit bounds, shared by the review form and the server validator so the
// two never disagree (they mirror the commit-2 attribute bounds).
export const MAX_PROPOSED_LABEL_LENGTH = 80;
export const MAX_PROPOSED_DESCRIPTION_LENGTH = 500;

/**
 * THE APPROVAL GATE for schema-grows-on-demand — the single source of truth for
 * "who may approve a suggested attribute (and thereby grow the schema)".
 *
 * Locked default (phase two): a super admin approves, matching the existing
 * schema-write gate. A member who is also a super admin can therefore approve
 * their own suggestion directly.
 *
 * TO CHANGE WHO MAY APPROVE — e.g. trusted members self-approving, or a
 * per-collection rule — EDIT THIS FUNCTION ONLY. Nothing else gates approval:
 * the approve/reject server action calls this and then performs the gated schema
 * write with the service role, so loosening the rule here never requires an RLS
 * change. The `collection` argument is unused today and reserved for a future
 * per-collection rule, so the signature does not have to change later.
 */
export function canApproveSchemaSuggestion(
  profile: { role?: string | null } | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  collection?: { id: string } | null,
): boolean {
  return profile?.role === "super_admin";
}
