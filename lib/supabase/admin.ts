import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Supabase service-role client. BYPASSES Row-Level Security entirely, so it is
 * the only access path to tables that have RLS enabled with no policies (deny
 * to anon/authenticated). The first and currently only such table is
 * `connection_secrets` (migration 0045), which holds encrypted OAuth tokens
 * that no client role may ever read.
 *
 * The `"server-only"` import makes this a build error if it is ever imported
 * into a client component — the service-role key must never reach the browser
 * bundle (supabase.md gotcha #2). Use this client narrowly: only for the
 * secrets table, never as a convenient way to skip RLS on user-scoped tables
 * (use `createSupabaseServerClient` for those, so RLS stays the last line of
 * defense).
 *
 * The env parse runs per-call (not at module load) so production builds can
 * succeed without secrets baked in, matching `lib/supabase/server.ts`. No
 * session is persisted or refreshed — this client carries no user identity.
 */

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function createSupabaseAdminClient() {
  const env = envSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
