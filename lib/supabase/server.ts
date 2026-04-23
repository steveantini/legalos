import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * Supabase server client. Returns a per-request client bound to the
 * current request's cookies. Call this from server components, route
 * handlers, and server actions. Do not cache or reuse the returned
 * client across requests.
 *
 * The env parse runs per-call (not at module load) so production
 * builds can succeed without secrets baked in. Missing env vars
 * surface as a clear ZodError on the first server action instead.
 */
export async function createSupabaseServerClient() {
  const env = envSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — Next.js disallows
            // cookie writes there. Session will refresh on the next
            // server action or route handler. Standard @supabase/ssr pattern.
          }
        },
      },
    },
  );
}
