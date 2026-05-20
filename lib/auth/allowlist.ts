/**
 * Pre-launch email allowlist gate.
 *
 * The legalOS auth surface is currently invite-only. Sign-in attempts
 * (and clicked magic-link callbacks) check the submitted email against
 * the `ALLOWED_EMAILS` environment variable. Listed emails proceed
 * through the normal Supabase magic-link flow; unlisted emails are
 * rejected with `ACCESS_REJECTION_MESSAGE`.
 *
 * `ALLOWED_EMAILS` is a comma-separated string of email addresses.
 * Whitespace around each entry is trimmed; matching is case-insensitive.
 * Example:
 *   ALLOWED_EMAILS=alice@example.com,bob@example.com, carol@example.com
 *
 * When `ALLOWED_EMAILS` is unset or empty, the allowlist is permissive
 * (every email is allowed). This is intentional: it prevents production
 * deploys without the env var configured from accidentally locking out
 * all users. The gate only enforces when the env var is set to a
 * non-empty value.
 *
 * Existing logged-in sessions are NOT re-validated against the
 * allowlist. The check runs at sign-in attempt and at callback, not on
 * every request. Users who signed in before the allowlist was tightened
 * remain signed in until they log out.
 *
 * Replacement path: when the invitation-gate work lands (sunsets D-035),
 * this helper's implementation swaps from env var lookup to DB lookup
 * (an `invitations` or `allowed_emails` table). The function signature
 * stays the same. Callers don't change.
 */

export const ACCESS_REJECTION_MESSAGE =
  "legalOS is currently invite-only. Reach out to the legalOS team for access.";

export function isEmailAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS;
  if (!raw || raw.trim() === "") {
    // Permissive when unset — see JSDoc.
    return true;
  }

  const normalized = email.trim().toLowerCase();
  const allowed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return allowed.includes(normalized);
}
