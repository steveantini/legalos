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
