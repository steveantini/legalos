"use server";

import { requireAuthUser } from "@/lib/auth/access";
import type {
  PreferenceListResult,
  PreferenceMutationResult,
  PreferenceResult,
  PreferenceRow,
  PreferenceValue,
} from "@/lib/preferences/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Per-user preferences server actions.
 *
 * Every action authenticates via `requireAuthUser` (redirects to /login
 * if unauthenticated). The underlying RLS policies on
 * `public.user_preferences` enforce `user_id = auth.uid()` at the DB
 * layer, so even an app-layer bug can't leak preferences across users.
 *
 * The schema-less Supabase client returns `never`-typed rows; the
 * actions cast at the query boundary rather than wiring full Database
 * types (matches the existing pattern in `scripts/import-c4l-plugin.ts`
 * and the launchpad query).
 */

/**
 * Get one preference value for the current user. `ok: true` with
 * `value: undefined` means the preference isn't set yet (callers
 * should treat that as "use the default" rather than an error).
 */
export async function getUserPreferenceAction<
  T extends PreferenceValue = PreferenceValue,
>(key: string): Promise<PreferenceResult<T>> {
  try {
    await requireAuthUser();
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("user_preferences")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    const row = data as { value: PreferenceValue } | null;
    return { ok: true, value: row ? (row.value as T) : undefined };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Set (upsert) a preference value for the current user. Uses the
 * `(user_id, key)` unique constraint as the conflict target; the
 * `updated_at` trigger refreshes on every write.
 */
export async function setUserPreferenceAction(
  key: string,
  value: PreferenceValue,
): Promise<PreferenceMutationResult> {
  try {
    const user = await requireAuthUser();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, key, value } as unknown as never,
        { onConflict: "user_id,key" },
      );

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * List preferences for the current user. Pass a `keyPrefix` to scope
 * the result (e.g., `"ui:dept:"` returns every department UI state
 * row in one query — cheaper than calling `get` per key).
 */
export async function listUserPreferencesAction(
  keyPrefix?: string,
): Promise<PreferenceListResult> {
  try {
    await requireAuthUser();
    const supabase = await createSupabaseServerClient();

    const baseQuery = supabase
      .from("user_preferences")
      .select("key, value, updated_at");

    const query = keyPrefix
      ? baseQuery.like("key", `${keyPrefix}%`)
      : baseQuery;

    const { data, error } = await query;
    if (error) {
      return { ok: false, error: error.message };
    }

    const rows = (data ?? []) as unknown as Array<{
      key: string;
      value: PreferenceValue;
      updated_at: string;
    }>;
    const preferences: PreferenceRow[] = rows.map((row) => ({
      key: row.key,
      value: row.value,
      updated_at: row.updated_at,
    }));
    return { ok: true, preferences };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Delete a preference for the current user. Equivalent to "reset to
 * default" — the next `get` returns `value: undefined`.
 */
export async function deleteUserPreferenceAction(
  key: string,
): Promise<PreferenceMutationResult> {
  try {
    await requireAuthUser();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("user_preferences")
      .delete()
      .eq("key", key);

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
