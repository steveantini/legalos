/**
 * Forgiving handling for the Substack URL shapes a real user pastes that the
 * generic resolution flow can't use as-is. Three cases, classified here (pure,
 * unit-tested), acted on in desk-feeds.ts:
 *
 *   - A stray `www.` on a publication subdomain (www.name.substack.com) is an
 *     invalid host Substack doesn't serve. SAFE to auto-fix: rewrite to
 *     name.substack.com and continue. Scoped strictly to `www.<one-label>.
 *     substack.com` so it never touches a genuine custom domain where `www.`
 *     is the canonical host.
 *   - A profile link (substack.com/@handle) is the central directory, not a
 *     publication. The handle is NOT guaranteed to be the publication
 *     subdomain, so this is only a CANDIDATE to verify by resolution, never a
 *     silent guess (the caller uses <handle>.substack.com only if it yields a
 *     real feed, else it shows the profile hint).
 *   - A reader-app post link (substack.com/home/post/...) has no clean path to
 *     the owning publication, so there is nothing to try: the caller shows the
 *     reader hint.
 *
 * Only substack.com / *.substack.com hosts are matched; every other URL
 * classifies as "none" and flows through the existing resolution untouched.
 */

export type SubstackClassification =
  | { kind: "none" }
  /** www.<sub>.substack.com → the corrected https URL without the www. */
  | { kind: "www-subdomain"; fixed: string }
  /** substack.com/@handle → the handle to try as <handle>.substack.com. */
  | { kind: "profile"; handle: string }
  /** substack.com/home/post/... → no resolvable publication. */
  | { kind: "reader-post" };

export function classifySubstackUrl(raw: string): SubstackClassification {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "none" };
  }
  const host = url.hostname.toLowerCase();

  // Central substack.com paths: profile and reader-app links.
  if (host === "substack.com" || host === "www.substack.com") {
    if (/^\/home\/post\//i.test(url.pathname)) {
      return { kind: "reader-post" };
    }
    const profile = /^\/@([^/?#]+)/.exec(url.pathname);
    if (profile) {
      return { kind: "profile", handle: profile[1] };
    }
    return { kind: "none" };
  }

  // A stray www. on a single-label publication subdomain. Strictly
  // www.<label>.substack.com — deeper hosts (www.a.b.substack.com) do not match.
  const wwwSub = /^www\.([^.]+)\.substack\.com$/.exec(host);
  if (wwwSub) {
    url.hostname = `${wwwSub[1]}.substack.com`;
    return { kind: "www-subdomain", fixed: url.toString() };
  }

  return { kind: "none" };
}

/** The publication URL to try for a profile handle (verified by the caller). */
export function substackHandleUrl(handle: string): string {
  return `https://${handle}.substack.com`;
}
