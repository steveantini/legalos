import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The metric-layer read seam (analytics arc, Step 1).
 *
 * Reads a service-role-locked analytics view (migration 0067) through the
 * server-only admin client. This is the ONLY path to these views: they bypass
 * RLS by design and are GRANTed to service_role only, and the read happens
 * inside per-tile server components that sit behind requirePlatformOwner(). There
 * is deliberately no API route fronting this — nothing for a non-platform-owner
 * to reach (see DECISION_LOG D-140).
 *
 * MISSING-VIEW TOLERANCE: migrations are hand-applied after deploy, so there is
 * a window where the deployed app queries a view that does not exist yet. A
 * missing relation (Postgres 42P01) or an absent schema-cache entry (PostgREST
 * PGRST205) resolves to `{ ok: false }`, not a throw — the tile then renders its
 * calm empty state instead of a 500. The service-role env not being configured
 * (the admin client throws on construction) degrades the same way. Any other
 * read error also fails closed to `{ ok: false }`; the unexpected ones are
 * logged (code only, no row data, no PII).
 */

export type MetricReadResult<T> = { ok: true; rows: T[] } | { ok: false };

/** Error codes we expect during the pre-migration / schema-reload window. */
const EXPECTED_MISSING_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

export async function readMetricView<T>(
  view: string,
): Promise<MetricReadResult<T>> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from(view).select("*");

    if (error) {
      if (!EXPECTED_MISSING_CODES.has(error.code ?? "")) {
        console.error("readMetricView failed", { view, code: error.code });
      }
      return { ok: false };
    }

    return { ok: true, rows: (data ?? []) as T[] };
  } catch {
    // Admin-client construction failed (e.g. SUPABASE_SERVICE_ROLE_KEY unset in
    // a given environment). Never let it surface as a tile crash.
    return { ok: false };
  }
}
