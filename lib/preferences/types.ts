/**
 * Types for the per-user preferences system.
 *
 * `PreferenceValue` is broad — any JSON-serializable shape — at the
 * storage layer. Specific preference keys narrow this further via the
 * registry in `lib/preferences/keys.ts`.
 */

// Object indexer admits `undefined` so consumer types with optional
// fields (e.g., `{ foo?: boolean }`, which is `boolean | undefined`)
// satisfy the constraint without an explicit index signature.
// JSONB serialization drops undefined fields, so this is safe at the
// storage layer — the round-trip just elides absent keys.
export type PreferenceValue =
  | string
  | number
  | boolean
  | null
  | PreferenceValue[]
  | { [key: string]: PreferenceValue | undefined };

export interface PreferenceRow {
  key: string;
  value: PreferenceValue;
  updated_at: string;
}

export type PreferenceResult<T = PreferenceValue> =
  | { ok: true; value: T | undefined }
  | { ok: false; error: string };

export type PreferenceListResult =
  | { ok: true; preferences: PreferenceRow[] }
  | { ok: false; error: string };

export type PreferenceMutationResult =
  | { ok: true }
  | { ok: false; error: string };
