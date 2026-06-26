import { z } from "zod";

/**
 * Collection schema definitions (Structured Query, commit 2). A collection's
 * schema is a set of ATTRIBUTES an admin defines for later extraction. This
 * module is the single home for the attribute shape, its zod validation (the
 * write boundary, Workflows-style), and the pure key helpers.
 *
 * It is deliberately NOT a "use server" or "server-only" module: the server
 * action validates with the zod schema here, the server data layer parses
 * stored jsonb with `parseCollectionAttributes`, and the client builder imports
 * the types, constants, and key helpers. All three need it, so it stays pure.
 *
 * KEY vs LABEL — the stability contract. An attribute carries both a human
 * `label` (what the admin types and edits) and a stable machine `key` (what
 * extraction and query reference). The key is derived from the label ONCE, when
 * the attribute is first created, and then frozen: editing the label never
 * changes the key. This is load-bearing — commit 3's extracted values are keyed
 * by attribute, so a stable key is what stops a label rename from orphaning
 * already-extracted data. Keys are generated client-side at save time (see the
 * builder) and re-validated here.
 */

/**
 * The supported attribute types. Each drives BOTH extraction (the shape to pull
 * out, commit 3) and query (how it can be asked about, commit 5):
 *  - text    free-form strings (counterparty, governing law). Match/contains.
 *  - number  numeric values (contract value, term length). Range / comparison.
 *  - date    temporal values (effective date, expiry). Before / after / range.
 *  - boolean yes/no facts (auto-renews?). Count / filter.
 *  - enum    one of a fixed set (agreement type, jurisdiction). The categorical
 *            case the prompt called out ("version 3", "agreement type"); it
 *            carries `options` and powers exact filter and group/count.
 * text/number/date/boolean cover the primitives; enum is included because so
 * many legal attributes are categorical, and a closed option set makes both
 * extraction and counting far more reliable than free text.
 */
export const COLLECTION_ATTRIBUTE_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "enum",
] as const;

export type CollectionAttributeType = (typeof COLLECTION_ATTRIBUTE_TYPES)[number];

/** One defined attribute. `options` is present (non-empty) iff type is "enum". */
export type CollectionAttribute = {
  /** Stable machine identifier; frozen once assigned (see the key contract). */
  key: string;
  /** Human label the admin types and may later edit without changing the key. */
  label: string;
  type: CollectionAttributeType;
  /**
   * The admin's plain-language definition of what to extract. LOAD-BEARING:
   * commit 3's model uses this to locate the attribute in a document.
   */
  description: string;
  /** The closed value set for an enum attribute. */
  options?: string[];
};

// Bounds. MAX_COLLECTION_ATTRIBUTES keeps a single document's extraction
// (commit 3) bounded — two dozen targeted lookups is comfortably more than any
// realistic contract schema (a rich CLM schema is ~12-18 fields) while capping
// the per-document cost. The others bound stored size and keep keys readable.
export const MAX_COLLECTION_ATTRIBUTES = 24;
export const MAX_ENUM_OPTIONS = 40;
export const MAX_ATTRIBUTE_LABEL_LENGTH = 80;
export const MAX_ATTRIBUTE_DESCRIPTION_LENGTH = 500;
export const MAX_ATTRIBUTE_OPTION_LENGTH = 80;
const MAX_ATTRIBUTE_KEY_LENGTH = 64;
// Slugs are trimmed shorter than the key cap so a uniqueness suffix ("_2") can
// always be appended without exceeding MAX_ATTRIBUTE_KEY_LENGTH.
const MAX_SLUG_LENGTH = 60;
const ATTRIBUTE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Derive a stable key from a human label: lowercase, non-alphanumerics to
 * single underscores, trimmed, and forced to start with a letter. Pure and
 * deterministic. Empty/again-empty input falls back to "attribute" so the
 * result always satisfies ATTRIBUTE_KEY_PATTERN.
 */
export function slugifyAttributeKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/_+$/g, "");
  return slug || "attribute";
}

/**
 * A key derived from `label` that does not collide with `existingKeys`,
 * appending "_2", "_3", ... on collision. Pure. Used at save time so each new
 * attribute gets a unique, readable key while existing keys are kept as-is.
 */
export function makeUniqueAttributeKey(
  label: string,
  existingKeys: Iterable<string>,
): string {
  const taken = new Set(existingKeys);
  const base = slugifyAttributeKey(label);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `_${n}`;
    const candidate = base.slice(0, MAX_ATTRIBUTE_KEY_LENGTH - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

const attributeSchema = z
  .object({
    key: z
      .string()
      .regex(ATTRIBUTE_KEY_PATTERN, "Attribute keys must be lowercase identifiers.")
      .max(MAX_ATTRIBUTE_KEY_LENGTH),
    label: z.string().trim().min(1, "Each attribute needs a name.").max(MAX_ATTRIBUTE_LABEL_LENGTH),
    type: z.enum(COLLECTION_ATTRIBUTE_TYPES),
    description: z
      .string()
      .trim()
      .min(1, "Each attribute needs a description of what to extract.")
      .max(MAX_ATTRIBUTE_DESCRIPTION_LENGTH),
    options: z
      .array(z.string().trim().min(1).max(MAX_ATTRIBUTE_OPTION_LENGTH))
      .max(MAX_ENUM_OPTIONS)
      .optional(),
  })
  .superRefine((attr, ctx) => {
    if (attr.type === "enum") {
      const options = attr.options ?? [];
      if (options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "A “one of” attribute needs at least one option.",
        });
      }
      if (new Set(options).size !== options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Options must be unique.",
        });
      }
    } else if (attr.options && attr.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Only “one of” attributes can have options.",
      });
    }
  });

/**
 * The attributes array: bounded length, valid attributes, and globally unique
 * keys. The duplicate-key check is here (across the whole array) rather than on
 * the per-attribute schema.
 */
export const collectionAttributesSchema = z
  .array(attributeSchema)
  .max(MAX_COLLECTION_ATTRIBUTES, `A schema can define at most ${MAX_COLLECTION_ATTRIBUTES} attributes.`)
  .superRefine((attributes, ctx) => {
    const seen = new Set<string>();
    attributes.forEach((attribute, index) => {
      if (seen.has(attribute.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: `Duplicate attribute key “${attribute.key}”.`,
        });
      }
      seen.add(attribute.key);
    });
  });

/** The full server-action input: which collection, and its attributes. */
export const collectionSchemaInputSchema = z.object({
  collectionId: z.string().uuid(),
  attributes: collectionAttributesSchema,
});

export type CollectionSchemaInput = z.infer<typeof collectionSchemaInputSchema>;

/**
 * Read stored jsonb back into typed attributes, defensively: malformed or
 * pre-validation data degrades to an empty list rather than throwing. Used by
 * the server data layer when projecting a collection's schema for display.
 */
export function parseCollectionAttributes(value: unknown): CollectionAttribute[] {
  const result = collectionAttributesSchema.safeParse(value);
  return result.success ? result.data : [];
}
