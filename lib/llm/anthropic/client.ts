import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { ModelCredential } from "@/lib/connections/providers/types";

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
 * The key is no longer read here: the caller resolves a {@link ModelCredential}
 * through the credential resolver (lib/llm/model-credential.ts) and passes it
 * in, so the single platform-key read lives in one place (the resolver, D-086).
 * In managed mode the resolved key is the platform `ANTHROPIC_API_KEY`, so the
 * constructed client is identical to before. `baseURL` is passed through when
 * the credential carries one (future self-hosted/BYO, 1c); managed mode leaves
 * it unset, so the SDK uses its default endpoint.
 */
export function createAnthropicClient(credential: ModelCredential): Anthropic {
  return new Anthropic({
    apiKey: credential.apiKey,
    ...(credential.baseURL ? { baseURL: credential.baseURL } : {}),
  });
}
