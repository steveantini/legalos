import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic client factory.
 *
 * Per D-008 and CLAUDE.md security non-negotiables, the Anthropic API key
 * is server-only — `ANTHROPIC_API_KEY` is never prefixed with NEXT_PUBLIC_,
 * never read from a client component, never proxied to the browser. The
 * `import "server-only"` directive at the top of this file makes the
 * Next.js build fail if a client component ever imports from this module
 * (or anything that imports from it).
 *
 * The SDK reads ANTHROPIC_API_KEY from the environment automatically; we
 * also pass `apiKey` explicitly so a missing env var fails fast with a
 * clear server-side error instead of a confusing 401 from Anthropic.
 */
export function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Configure it in .env.local for local " +
        "dev and in Vercel Production/Preview env vars for deploys. See " +
        "SETUP.md and DECISION_LOG.md D-008.",
    );
  }
  return new Anthropic({ apiKey });
}
