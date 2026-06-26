/**
 * Small, shared classifiers for PostgREST/Postgres error shapes.
 *
 * These let application code degrade gracefully around schema that may differ by
 * environment — specifically a newly-added column whose migration is applied
 * separately from the code deploy (e.g. messages.pre_step_result, D-193). When a
 * read or write references such a column before the migration has landed, Postgres
 * raises undefined_column (SQLSTATE 42703); callers catch it via the helper below
 * and retry without the optional field rather than failing the operation.
 */

/** The shape we read off a Supabase/PostgREST error: just its SQLSTATE code. */
type CodedError = { code?: string | null } | null | undefined;

/**
 * True when an error is Postgres's undefined_column (SQLSTATE 42703) — "column
 * ... does not exist". Surfaced by PostgREST in the error's `code` field. Use this
 * to tolerate a not-yet-applied additive column migration: drop the optional field
 * and retry, leaving the rest of the operation intact.
 */
export function isUndefinedColumnError(error: CodedError): boolean {
  return error?.code === "42703";
}

/**
 * True when an error means a TABLE/relation is absent — Postgres undefined_table
 * (SQLSTATE 42P01) or PostgREST's schema-cache miss for an unknown table
 * (PGRST205). The table-level companion to isUndefinedColumnError: use it to
 * tolerate a not-yet-applied table migration whose code deploy may land before
 * the migration (e.g. the documents anchor, Structured Query commit 1), falling
 * back to the pre-migration path until the table exists.
 */
export function isUndefinedTableError(error: CodedError): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
