/**
 * Apple Podcasts support for the Desk add-feed flow.
 *
 * Apple Podcasts pages (podcasts.apple.com/.../id<NUMBER>) are a directory
 * listing, not a feed, and they do NOT advertise the underlying RSS via the
 * HTML autodiscovery `<link>` tags the generic flow relies on. But every
 * Apple-listed show HAS an underlying RSS feed, and Apple exposes it through a
 * public, no-auth lookup API. These pure helpers detect such a URL, pull the
 * numeric show id, build the lookup URL, and read the feed URL out of the
 * lookup JSON; the actual (SSRF-guarded) fetches live in desk-feeds.ts.
 */

/** Hosts that serve Apple Podcasts show pages. */
const APPLE_PODCAST_HOSTS = new Set(["podcasts.apple.com", "itunes.apple.com"]);

/** Whether a URL points at an Apple Podcasts page (by host). */
export function isApplePodcastsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return APPLE_PODCAST_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * Extract the numeric podcast id from an Apple Podcasts URL, or null. Handles
 * the localized show shapes (/us/podcast/<slug>/id123, /podcast/id123), an
 * episode link (the trailing ?i=... is ignored; the show id is what matters),
 * and the legacy itunes.apple.com host. Returns null for a non-Apple URL or an
 * Apple URL with no id segment.
 */
export function extractApplePodcastId(url: string): string | null {
  if (!isApplePodcastsUrl(url)) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const match = /\/id(\d+)/.exec(pathname);
  return match ? match[1] : null;
}

/** Apple's public lookup endpoint for a podcast id. */
export function appleLookupUrl(id: string): string {
  return `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`;
}

/**
 * Read the show's RSS feed URL out of an Apple lookup JSON response, or null.
 * Returns null for malformed JSON, an empty result set, a result with no
 * feedUrl (some entries lack one), or a non-http(s) feedUrl.
 */
export function parseAppleLookupFeedUrl(json: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const results =
    typeof data === "object" && data !== null
      ? (data as { results?: unknown }).results
      : undefined;
  if (!Array.isArray(results)) return null;

  for (const entry of results) {
    const feed =
      typeof entry === "object" && entry !== null
        ? (entry as { feedUrl?: unknown }).feedUrl
        : undefined;
    if (typeof feed !== "string") continue;
    try {
      const u = new URL(feed);
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch {
      // keep scanning subsequent results
    }
  }
  return null;
}
