/**
 * Validates a `next` redirect path. Returns the path if it's a same-origin
 * relative URL, or the provided default otherwise.
 *
 *   /workspace/agents/abc → /workspace/agents/abc   (valid relative path)
 *   //evil.com            → /workspace              (protocol-relative, blocked)
 *   https://evil.com      → /workspace              (absolute, blocked)
 *   null / undefined / "" → /workspace              (no value, defaulted)
 *
 * Prevents open-redirect attacks via protocol-relative or absolute URLs.
 * Called at two layers: proxy.ts when building the /login redirect for an
 * unauthenticated request, and /auth/callback/route.ts before honoring the
 * post-exchange redirect. Defense in depth — the value travels through a
 * magic-link email URL in between, so a hostile rewrite would be caught at
 * callback time even if proxy validation were somehow bypassed.
 */
export function safeNextPath(
  raw: string | null | undefined,
  defaultPath = "/workspace",
): string {
  if (!raw) return defaultPath;
  if (!raw.startsWith("/")) return defaultPath;
  if (raw.startsWith("//")) return defaultPath;
  return raw;
}
