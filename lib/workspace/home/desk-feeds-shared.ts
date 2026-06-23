/**
 * Shared types and pure helpers for the Desk feeds surface, safe to import from
 * both server modules and the client view (no server-only or node imports).
 *
 * The view model deliberately carries a `sourceType` discriminator. Today every
 * card is 'personal' (a feed the user added). When admin-curated, role-scoped
 * Desk content ships as a sibling source, its cards map into this SAME shape
 * with sourceType 'curated', and the Desk renders both without a card change.
 */

/** How many personal feeds one user may keep. Bounds the Desk and fetch load. */
export const FEED_CAP = 12;

/** Cache lifetime for a feed's latest item before a refresh is attempted. */
export const FEED_TTL_MS = 45 * 60 * 1000; // 45 minutes

/** Provenance of a Desk card. 'curated' is reserved for the future admin layer. */
export type DeskSourceType = "personal" | "curated";

/** The latest item of a feed, as the card renders it. */
export type DeskFeedItem = {
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  durationSeconds: number | null;
};

/** One Desk card: a content source plus its cached latest item. */
export type DeskCard = {
  id: string;
  sourceType: DeskSourceType;
  /** Publication/show title (or the host, when the feed gave none). */
  title: string;
  /** The publication's website, for the card's click-through fallback. */
  siteUrl: string | null;
  feedUrl: string;
  item: DeskFeedItem | null;
  /** 'pending' while the first fetch is in flight; 'ok'/'error' after. */
  status: "pending" | "ok" | "error";
  lastFetchedAt: string | null;
};

/**
 * Whether a feed's cache is stale and should be refreshed. A never-fetched feed
 * (null timestamp) is always stale. Pure, so the refresh decision is unit-tested
 * without a clock or a database.
 */
export function isFeedStale(
  lastFetchedAt: string | null,
  nowMs: number,
  ttlMs: number = FEED_TTL_MS,
): boolean {
  if (lastFetchedAt == null) return true;
  const fetchedMs = Date.parse(lastFetchedAt);
  if (Number.isNaN(fetchedMs)) return true;
  return nowMs - fetchedMs >= ttlMs;
}

/**
 * A compact relative date for the card ("2h ago", "3d ago", or a locale date
 * past a month). Returns "" for null/invalid input so the card omits the line.
 */
export function relativeDate(iso: string | null, nowMs: number): string {
  if (iso == null) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

/** Format a podcast duration in seconds as "H:MM:SS" or "M:SS"; "" when null. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = m.toString().padStart(h > 0 ? 2 : 1, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
