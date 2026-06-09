import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Supabase service-role client. BYPASSES Row-Level Security entirely, so it is
 * the access path to objects that the client roles can never reach. There are
 * two deliberate, sanctioned uses today:
 *
 *   1. `connection_secrets` (migration 0045) — RLS enabled with no policies, so
 *      it denies anon/authenticated outright; holds encrypted OAuth tokens that
 *      no client role may ever read.
 *   2. The cross-tenant platform-analytics views `operator_*` (migration 0067) —
 *      these aggregate ACROSS organizations, so they intentionally bypass RLS
 *      (owner-rights) and are GRANTed to service_role only. They are read here
 *      exclusively inside per-tile server components behind requirePlatformOwner().
 *
 * Both are narrow, intentional bypasses, not creeping misuse. Adding a third use
 * deserves the same scrutiny: prefer `createSupabaseServerClient` for anything
 * user- or org-scoped, so RLS stays the last line of defense.
 *
 * The `"server-only"` import makes this a build error if it is ever imported
 * into a client component — the service-role key must never reach the browser
 * bundle (supabase.md gotcha #2).
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
