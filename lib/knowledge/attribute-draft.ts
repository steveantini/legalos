import {
  COLLECTION_ATTRIBUTE_TYPES,
  type CollectionAttributeType,
} from "@/lib/knowledge/collection-schema";
import type { QueryableAttribute } from "@/lib/knowledge/structured-query-shared";
import {
  MAX_PROPOSED_DESCRIPTION_LENGTH,
  MAX_PROPOSED_LABEL_LENGTH,
  type ProposedAttribute,
} from "@/lib/knowledge/schema-suggestions-shared";

/**
 * The model-DRAFT prompt and parser for schema-grows-on-demand (phase two). From
 * the user's gapped question and the concept it asked about, a model drafts a
 * proposed attribute definition — a label, an inferred type (with enum options
 * when evident), and a DRAFT description (the load-bearing field extraction
 * uses). The draft is a PROPOSAL: an admin reviews and edits it (especially the
 * description) before anything is committed. Nothing here adds to a schema; the
 * model never guesses an answer, only proposes a structure.
 *
 * Pure (prompt building + defensive parse), so it is unit-tested with no model.
 * The impure model call lives in `lib/knowledge/structured-query.ts`
 * (`draftAttributeDefinition`), reusing the same model-agnostic path as the rest.
 */

const ATTRIBUTE_TYPES = new Set<string>(COLLECTION_ATTRIBUTE_TYPES);
const MAX_OPTIONS = 40;

/** Describe the fields the collection already tracks, so the draft does not
 * duplicate one and picks a type consistent with the schema's style. */
function describeExisting(attributes: QueryableAttribute[]): string {
  if (attributes.length === 0) return "(none yet)";
  return attributes
    .map((a) => `- ${a.label} (${a.type})`)
    .join("\n");
}

export function buildDraftSystemPrompt(existing: QueryableAttribute[]): string {
  return [
    "You help a legal team extend a document collection's set of tracked attributes.",
    "Given a question the collection could not answer and the concept it asked about, DRAFT one new attribute to track, so the concept becomes extractable from each document.",
    "The collection already tracks these fields (do not duplicate one):",
    describeExisting(existing),
    "",
    "Pick the best type for the concept:",
    "- text: free-form strings (a counterparty, a governing law).",
    "- number: numeric values (a contract value, a term length).",
    "- date: a calendar date (an effective date, an expiry).",
    "- boolean: a yes/no fact (does it auto-renew).",
    "- enum: one of a small fixed set; include the options when they are evident.",
    "",
    "Respond with ONLY a JSON object, no other text, of this exact shape:",
    '{"label": "<a short human label>", "type": "text|number|date|boolean|enum", "description": "<a precise instruction telling an extractor exactly what to find in a document and how to recognize it>", "options": ["<option>", ...]}',
    "Rules:",
    "- The description is the most important field: it is what an extraction model will follow, so make it specific and unambiguous.",
    "- Include options ONLY for an enum type; omit it otherwise.",
    "- Propose exactly one attribute. Never answer the question itself; only define how to track it.",
  ].join("\n");
}

export function buildDraftUserPrompt(question: string, missingConcept: string): string {
  return [
    `Concept to track: ${JSON.stringify(missingConcept)}`,
    `Question that needed it: ${JSON.stringify(question)}`,
  ].join("\n");
}

function toType(value: unknown): CollectionAttributeType {
  return typeof value === "string" && ATTRIBUTE_TYPES.has(value)
    ? (value as CollectionAttributeType)
    : "text";
}

/**
 * Parse the model's draft into a `ProposedAttribute`, defensively. Returns null
 * when no usable label or description is present (the action then falls back to
 * a minimal editable draft rather than failing — a human owns the final wording
 * regardless). Options are kept only for an enum type.
 */
export function parseDraftOutput(text: string): ProposedAttribute | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const label = typeof obj.label === "string" ? obj.label.trim().slice(0, MAX_PROPOSED_LABEL_LENGTH) : "";
  const description =
    typeof obj.description === "string"
      ? obj.description.trim().slice(0, MAX_PROPOSED_DESCRIPTION_LENGTH)
      : "";
  if (label.length === 0 || description.length === 0) return null;

  const type = toType(obj.type);
  const proposed: ProposedAttribute = { label, type, description };

  if (type === "enum" && Array.isArray(obj.options)) {
    const options = obj.options
      .filter((o): o is string => typeof o === "string")
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
      .slice(0, MAX_OPTIONS);
    if (options.length > 0) proposed.options = [...new Set(options)];
  }
  return proposed;
}
