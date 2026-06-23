import "server-only";

import {
  appleLookupUrl,
  extractApplePodcastId,
  isApplePodcastsUrl,
  parseAppleLookupFeedUrl,
} from "@/lib/workspace/home/apple-podcasts";
import { safeFetch, UnsafeFeedUrlError } from "@/lib/workspace/home/feed-fetch";
import {
  discoverFeedLinks,
  parseFeed,
  type ParsedFeed,
} from "@/lib/workspace/home/feed-parser";
import {
  classifySubstackUrl,
  substackHandleUrl,
} from "@/lib/workspace/home/substack";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { DeskCard } from "@/lib/workspace/home/desk-feeds-shared";

/**
 * Server-side reads and the fetch-and-cache resolver for the Desk feeds surface
 * (Desk feeds v1). Server-only: it imports the Supabase server client and the
 * node-runtime safe fetcher. The Desk renders from the cached columns this
 * module populates; the live fetch happens here, on add and on a TTL refresh,
 * never on a page render.
 */

/** The desk_feeds columns the Desk reads. */
type DeskFeedRow = {
  id: string;
  feed_url: string;
  site_url: string | null;
  title: string;
  cached_item_title: string | null;
  cached_item_url: string | null;
  cached_item_published_at: string | null;
  cached_image_url: string | null;
  cached_duration_seconds: number | null;
  fetch_status: "pending" | "ok" | "error";
  last_fetched_at: string | null;
  sort_order: number;
  added_at: string;
};

const FEED_ROW_COLUMNS =
  "id, feed_url, site_url, title, cached_item_title, cached_item_url, " +
  "cached_item_published_at, cached_image_url, cached_duration_seconds, " +
  "fetch_status, last_fetched_at, sort_order, added_at";

/**
 * The current user's personal Desk feeds, ordered for display. Owner-scoped by
 * RLS (the policy fences to auth.uid() within the org), so passing userId is for
 * the query predicate's clarity, not the security boundary. Returns [] on error
 * so the Desk degrades to its empty state rather than breaking the home page.
 */
export async function getDeskFeeds(userId: string): Promise<DeskCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("desk_feeds")
    .select(FEED_ROW_COLUMNS)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("added_at", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as DeskFeedRow[]).map(rowToCard);
}

function rowToCard(row: DeskFeedRow): DeskCard {
  const hasItem =
    row.cached_item_title != null || row.cached_item_url != null;
  return {
    id: row.id,
    sourceType: "personal",
    title: row.title.trim().length > 0 ? row.title : hostOf(row.feed_url),
    siteUrl: row.site_url,
    feedUrl: row.feed_url,
    status: row.fetch_status,
    lastFetchedAt: row.last_fetched_at,
    item: hasItem
      ? {
          title: row.cached_item_title,
          url: row.cached_item_url ?? row.site_url,
          publishedAt: row.cached_item_published_at,
          imageUrl: row.cached_image_url,
          durationSeconds: row.cached_duration_seconds,
        }
      : null,
  };
}

/**
 * The cache columns a fetch produces, written verbatim onto the feed row by the
 * add and refresh actions. `last_fetched_at` is set by the caller at write time
 * (so the timestamp matches the row's other server-stamped values).
 */
export type FeedCacheUpdate = {
  title?: string;
  site_url: string | null;
  cached_item_title: string | null;
  cached_item_url: string | null;
  cached_item_published_at: string | null;
  cached_image_url: string | null;
  cached_duration_seconds: number | null;
  fetch_status: "ok" | "error";
};

/**
 * Fetch and parse a feed, returning the cache columns to persist. Never throws
 * for an ordinary fetch/parse failure: a blocked host, timeout, non-200, or
 * unparseable body all resolve to a status:'error' update, so the feed keeps
 * its row and shows a calm "couldn't load" card. `resolvedTitle` is returned
 * only when the feed names itself, so a user-set title is never overwritten
 * with a blank.
 */
export async function resolveFeed(
  feedUrl: string,
): Promise<FeedCacheUpdate> {
  try {
    const { body } = await safeFetch(feedUrl);
    const parsed = parseFeed(body);
    if (!parsed) return errorUpdate();
    return buildUpdate(parsed);
  } catch (err) {
    // UnsafeFeedUrlError and network/timeout/size errors alike land here; the
    // card's honest failure state is the same regardless of cause.
    void (err instanceof UnsafeFeedUrlError);
    return errorUpdate();
  }
}

/** The cache columns for a successfully parsed feed. */
function buildUpdate(parsed: ParsedFeed): FeedCacheUpdate {
  const item = parsed.latestItem;
  return {
    title: parsed.title ?? undefined,
    site_url: parsed.siteUrl,
    cached_item_title: item?.title ?? null,
    cached_item_url: item?.url ?? null,
    cached_item_published_at: item?.publishedAt ?? null,
    cached_image_url: item?.imageUrl ?? parsed.imageUrl ?? null,
    cached_duration_seconds: item?.durationSeconds ?? null,
    fetch_status: "ok",
  };
}

/** The outcome of resolving a feed from a user-pasted URL (a feed or a page). */
export type FeedResolution =
  | { ok: true; feedUrl: string; update: FeedCacheUpdate }
  | { ok: false; error: string };

/** The honest dead-end message when a page advertises no discoverable feed. */
const NO_FEED_FOUND =
  "Couldn't find a feed at that link. Try the publication's feed URL (often the site address followed by /feed).";

/** Substack-specific hints for the central-domain shapes that have no clean feed. */
const SUBSTACK_PROFILE_HINT =
  "That looks like a Substack profile link. Open the publication and paste its web address (often name.substack.com).";
const SUBSTACK_READER_HINT =
  "That looks like a Substack reader link. Open the post and paste the publication's own web address (often name.substack.com).";

/** Apple Podcasts honest errors, kept distinct so the user knows what to do next. */
const APPLE_NO_ID =
  "Couldn't read the show ID from that Apple Podcasts link. Open the show in Apple Podcasts and copy its link again.";
const APPLE_NO_FEED =
  "Couldn't find a feed for that Apple Podcasts show. Some shows don't publish one; try the show's RSS feed directly.";
const APPLE_LOAD_FAILED =
  "Couldn't load that Apple Podcasts show right now. Try again, or add its RSS feed directly.";

/**
 * Resolve an Apple Podcasts show URL to its underlying RSS feed via Apple's
 * public lookup API. Apple directory pages don't advertise the feed for
 * autodiscovery, so this runs BEFORE the generic flow. Both the lookup call and
 * the resulting feed fetch go through the same SSRF-guarded `safeFetch` (Apple's
 * host is public and allowed by the guard; routing it through keeps one fetch
 * path). The RESOLVED feed URL is returned for storage, so refreshes hit the
 * show's feed, not Apple.
 */
async function resolveApplePodcast(inputUrl: string): Promise<FeedResolution> {
  const id = extractApplePodcastId(inputUrl);
  if (!id) return { ok: false, error: APPLE_NO_ID };

  let lookup: { body: string; finalUrl: string };
  try {
    lookup = await safeFetch(appleLookupUrl(id));
  } catch {
    return { ok: false, error: APPLE_LOAD_FAILED };
  }

  const feedUrl = parseAppleLookupFeedUrl(lookup.body);
  if (!feedUrl) return { ok: false, error: APPLE_NO_FEED };

  // From here it is the normal flow: fetch and parse the real feed.
  try {
    const feed = await safeFetch(feedUrl);
    const parsed = parseFeed(feed.body);
    if (parsed) {
      return { ok: true, feedUrl: feed.finalUrl, update: buildUpdate(parsed) };
    }
  } catch {
    // fall through to the calm load-failed message
  }
  return { ok: false, error: APPLE_LOAD_FAILED };
}

/**
 * Resolve a feed from ANY URL a user pastes, so they need not know the exact RSS
 * endpoint. The flow, all fetches through the SAME SSRF-guarded `safeFetch` (no
 * second, unguarded fetch path):
 *
 *   1. Fetch the URL. If the body parses as RSS/Atom, it is already a feed
 *      (content-type is ignored, so a feed served as text/html still works) —
 *      use it directly, storing the post-redirect final URL so refreshes hit
 *      the feed, not a redirector.
 *   2. Otherwise it is an HTML page: read its autodiscovery `<link>` tags and
 *      try each advertised feed in order (the first rel=alternate is usually the
 *      primary). The first that fetches and parses wins; if an advertised feed
 *      404s, the next is tried.
 *   3. If nothing resolves, return the honest NO_FEED_FOUND message.
 *
 * The RESOLVED feed URL is returned for storage, so the Desk row points at the
 * real feed regardless of what the user pasted.
 */
export async function resolveFeedFromUrl(
  inputUrl: string,
): Promise<FeedResolution> {
  // Apple Podcasts pages don't autodiscover their feed, so resolve them via
  // Apple's lookup API before the generic page flow. Non-Apple URLs skip this.
  if (isApplePodcastsUrl(inputUrl)) {
    return resolveApplePodcast(inputUrl);
  }

  // Forgive the common Substack URL shapes before the generic flow.
  const substack = classifySubstackUrl(inputUrl);
  if (substack.kind === "reader-post") {
    return { ok: false, error: SUBSTACK_READER_HINT };
  }
  if (substack.kind === "profile") {
    // The handle is not guaranteed to be the publication subdomain, so try it
    // and use it ONLY if it resolves to a real feed; never guess-and-add.
    const resolved = await tryResolveFromPage(substackHandleUrl(substack.handle));
    return resolved ?? { ok: false, error: SUBSTACK_PROFILE_HINT };
  }
  // A stray www. on a publication subdomain is safely corrected; everything
  // else flows through unchanged.
  const effectiveUrl =
    substack.kind === "www-subdomain" ? substack.fixed : inputUrl;

  let page: { body: string; finalUrl: string };
  try {
    page = await safeFetch(effectiveUrl);
  } catch (err) {
    if (err instanceof UnsafeFeedUrlError) {
      return { ok: false, error: "That address can't be reached." };
    }
    return {
      ok: false,
      error: "Couldn't load that link. Check the URL and try again.",
    };
  }

  return (await feedFromPage(page)) ?? { ok: false, error: NO_FEED_FOUND };
}

/**
 * Given an already-fetched page, return its feed: the body itself if it parses
 * as RSS/Atom, else the first autodiscovered feed that fetches and parses.
 * Returns null when nothing resolves. Shared by the main flow and the Substack
 * profile attempt so both behave identically.
 */
async function feedFromPage(page: {
  body: string;
  finalUrl: string;
}): Promise<FeedResolution | null> {
  const direct = parseFeed(page.body);
  if (direct) {
    return { ok: true, feedUrl: page.finalUrl, update: buildUpdate(direct) };
  }
  for (const candidate of discoverFeedLinks(page.body, page.finalUrl)) {
    try {
      const feed = await safeFetch(candidate);
      const parsed = parseFeed(feed.body);
      if (parsed) {
        return { ok: true, feedUrl: feed.finalUrl, update: buildUpdate(parsed) };
      }
    } catch {
      // A blocked, broken, or 404ing advertised feed: fall through to the next.
    }
  }

  return null;
}

/**
 * Fetch a URL and resolve a feed from it, returning null on ANY failure (a
 * blocked/unreachable host, a network error, or no discoverable feed). Used for
 * the Substack profile attempt, where a miss must fall through to the hint
 * rather than surface a fetch error.
 */
async function tryResolveFromPage(url: string): Promise<FeedResolution | null> {
  let page: { body: string; finalUrl: string };
  try {
    page = await safeFetch(url);
  } catch {
    return null;
  }
  return feedFromPage(page);
}

function errorUpdate(): FeedCacheUpdate {
  return {
    site_url: null,
    cached_item_title: null,
    cached_item_url: null,
    cached_item_published_at: null,
    cached_image_url: null,
    cached_duration_seconds: null,
    fetch_status: "error",
  };
}

/**
 * The render-time clock the Desk uses to format relative dates. Read here, in a
 * plain module function rather than inside a component, so the value is captured
 * once per request and passed down as a stable prop (the component render itself
 * stays pure — no Date.now() at a render site).
 */
export function deskClockMs(): number {
  return Date.now();
}

/** The hostname of a URL, used as the title fallback when a feed is unnamed. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
