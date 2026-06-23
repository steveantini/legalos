import "server-only";

import { safeFetch, UnsafeFeedUrlError } from "@/lib/workspace/home/feed-fetch";
import { parseFeed } from "@/lib/workspace/home/feed-parser";
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
  } catch (err) {
    // UnsafeFeedUrlError and network/timeout/size errors alike land here; the
    // card's honest failure state is the same regardless of cause.
    void (err instanceof UnsafeFeedUrlError);
    return errorUpdate();
  }
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
