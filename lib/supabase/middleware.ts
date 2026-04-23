import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * Supabase client factory for use inside the Next.js proxy (`proxy.ts`
 * at repo root — called "middleware" before Next.js 16, see D-017).
 *
 * This file's name and the exported function name retain "middleware"
 * vocabulary for filename stability; only the Next.js file convention
 * itself was renamed.
 *
 * The proxy cannot use the cookie plumbing from `lib/supabase/server.ts`
 * (which relies on `next/headers`). The @supabase/ssr pattern here
 * builds a mutable `supabaseResponse` that carries refreshed session
 * cookies back to the browser.
 *
 * Callers MUST return the object from `getSupabaseResponse()` as their
 * proxy response (or apply its cookies to their own response).
 * Returning a fresh `NextResponse.next()` drops the refreshed session
 * cookie and silently logs the user out on the next request.
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  const env = envSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  return {
    supabase,
    getSupabaseResponse: () => supabaseResponse,
  };
}
