/**
 * A small, dependency-free RSS/Atom feed parser, scoped to exactly what the
 * Desk needs: a feed's title, site link, and channel image, plus its LATEST
 * item (title, link, published date, image, and podcast duration when present).
 *
 * Why hand-rolled rather than a library: v1 reads a handful of well-formed
 * fields from the head of the document, the inputs are small, and avoiding a
 * dependency keeps the server bundle and the supply-chain surface minimal. The
 * parser is deliberately tolerant (namespaces like itunes:/media:/dc: are
 * matched loosely, CDATA and the common HTML entities are decoded) and
 * fail-soft: malformed input yields null rather than throwing, so a bad feed
 * shows a calm "couldn't load" card and never breaks the Desk.
 *
 * It is NOT a general-purpose XML parser and is not used to render anything as
 * HTML — every extracted string is plain text the UI escapes on render.
 */

export type ParsedFeedItem = {
  title: string | null;
  /** The item's canonical link (absolute http(s) URL), or null. */
  url: string | null;
  /** ISO 8601 publication timestamp, or null when absent/unparseable. */
  publishedAt: string | null;
  /** Absolute http(s) image URL for the item/episode, or null. */
  imageUrl: string | null;
  /** Episode length in seconds (podcasts), or null. */
  durationSeconds: number | null;
};

export type ParsedFeed = {
  /** The publication/channel title, or null. */
  title: string | null;
  /** The publication's website (absolute http(s) URL), or null. */
  siteUrl: string | null;
  /** The channel/show artwork (absolute http(s) URL), or null. */
  imageUrl: string | null;
  /** The most recent item, or null when the feed carries none. */
  latestItem: ParsedFeedItem | null;
};

/** Cap on any single extracted text field, so a pathological feed can't bloat a row. */
const MAX_TEXT = 500;

/**
 * Parse a feed document. Returns null only when the input is clearly not a feed
 * (no <item> and no <entry>); a feed with missing optional fields still parses,
 * with those fields null.
 */
export function parseFeed(xml: string): ParsedFeed | null {
  if (typeof xml !== "string" || xml.trim().length === 0) return null;

  const itemMatch = /<item[\s>]/i.exec(xml);
  const entryMatch = /<entry[\s>]/i.exec(xml);
  const isAtom = entryMatch != null && itemMatch == null;

  // Channel scope = everything before the first item/entry, so a channel-level
  // <title>/<link>/<image> is not confused with an item's.
  const firstItemIndex = isAtom
    ? (entryMatch?.index ?? xml.length)
    : (itemMatch?.index ?? xml.length);
  const channel = xml.slice(0, firstItemIndex);

  if (isAtom) {
    return parseAtom(xml, channel);
  }
  if (itemMatch) {
    return parseRss(xml, channel);
  }
  return null;
}

// ---------------------------------------------------------------------------
// RSS 2.0
// ---------------------------------------------------------------------------

function parseRss(xml: string, channel: string): ParsedFeed {
  const title = text(tagContent(channel, "title"));
  const siteUrl = httpUrl(text(tagContent(channel, "link")));
  const imageUrl =
    httpUrl(text(tagContent(tagContent(channel, "image") ?? "", "url"))) ??
    httpUrl(attr(firstTag(channel, "itunes:image"), "href"));

  const itemBlock = firstBlock(xml, "item");
  const latestItem = itemBlock ? parseRssItem(itemBlock, imageUrl) : null;

  return { title, siteUrl, imageUrl, latestItem };
}

function parseRssItem(item: string, channelImage: string | null): ParsedFeedItem {
  const title = text(tagContent(item, "title"));
  const url =
    httpUrl(text(tagContent(item, "link"))) ??
    httpUrl(text(tagContent(item, "guid")));
  const publishedAt = isoDate(
    text(tagContent(item, "pubDate")) ?? text(tagContent(item, "dc:date")),
  );
  const imageUrl =
    httpUrl(attr(firstTag(item, "itunes:image"), "href")) ??
    httpUrl(attr(firstTag(item, "media:thumbnail"), "url")) ??
    httpUrl(imageEnclosure(item)) ??
    httpUrl(attr(mediaImageContent(item), "url")) ??
    channelImage;
  const durationSeconds = parseDuration(text(tagContent(item, "itunes:duration")));

  return { title, url, publishedAt, imageUrl, durationSeconds };
}

// ---------------------------------------------------------------------------
// Atom
// ---------------------------------------------------------------------------

function parseAtom(xml: string, channel: string): ParsedFeed {
  const title = text(tagContent(channel, "title"));
  const siteUrl = atomLink(channel);
  const imageUrl =
    httpUrl(text(tagContent(channel, "logo"))) ??
    httpUrl(text(tagContent(channel, "icon")));

  const entryBlock = firstBlock(xml, "entry");
  const latestItem = entryBlock ? parseAtomEntry(entryBlock, imageUrl) : null;

  return { title, siteUrl, imageUrl, latestItem };
}

function parseAtomEntry(entry: string, channelImage: string | null): ParsedFeedItem {
  const title = text(tagContent(entry, "title"));
  const url = atomLink(entry);
  const publishedAt = isoDate(
    text(tagContent(entry, "published")) ?? text(tagContent(entry, "updated")),
  );
  const imageUrl =
    httpUrl(attr(firstTag(entry, "media:thumbnail"), "url")) ??
    httpUrl(attr(mediaImageContent(entry), "url")) ??
    channelImage;

  return { title, url, publishedAt, imageUrl, durationSeconds: null };
}

/**
 * Atom <link>: prefer rel="alternate" (the human page), else the first link
 * that has no rel or a non-self/enclosure rel. Skips rel="self" (the feed URL)
 * and rel="enclosure" (media), which are not the article page.
 */
function atomLink(scope: string): string | null {
  const links = scope.match(/<link\b[^>]*\/?>/gi) ?? [];
  let fallback: string | null = null;
  for (const link of links) {
    const rel = (attr(link, "rel") ?? "").toLowerCase();
    const href = httpUrl(attr(link, "href"));
    if (!href) continue;
    if (rel === "alternate") return href;
    if (rel === "self" || rel === "enclosure") continue;
    if (fallback == null) fallback = href;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** The first `<enclosure>` whose type is an image, returning its url. */
function imageEnclosure(scope: string): string | null {
  const encs = scope.match(/<enclosure\b[^>]*\/?>/gi) ?? [];
  for (const enc of encs) {
    const type = (attr(enc, "type") ?? "").toLowerCase();
    if (type.startsWith("image/")) return attr(enc, "url");
  }
  return null;
}

/** The first `<media:content>` whose medium/type is an image. */
function mediaImageContent(scope: string): string | null {
  const tags = scope.match(/<media:content\b[^>]*\/?>/gi) ?? [];
  for (const tag of tags) {
    const medium = (attr(tag, "medium") ?? "").toLowerCase();
    const type = (attr(tag, "type") ?? "").toLowerCase();
    if (medium === "image" || type.startsWith("image/")) return tag;
  }
  return null;
}

/**
 * Inner text of the first `<name ...>...</name>` within `scope`, or null. Name
 * may carry a namespace prefix or attributes. Returns the raw inner content
 * (CDATA/entities still encoded); pass through `text()` to normalize.
 */
function tagContent(scope: string, name: string): string | null {
  if (!scope) return null;
  const re = new RegExp(
    `<${escapeName(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeName(name)}>`,
    "i",
  );
  const m = re.exec(scope);
  return m ? m[1] : null;
}

/** The first whole `<name ...>...</name>` block (inclusive of the tags). */
function firstBlock(scope: string, name: string): string | null {
  const re = new RegExp(
    `<${escapeName(name)}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escapeName(name)}>`,
    "i",
  );
  const m = re.exec(scope);
  return m ? m[0] : null;
}

/** The first self-closing-or-open `<name .../>` tag string, for attribute reads. */
function firstTag(scope: string, name: string): string | null {
  const re = new RegExp(`<${escapeName(name)}\\b[^>]*\\/?>`, "i");
  const m = re.exec(scope);
  return m ? m[0] : null;
}

/** Read an attribute value (single or double quoted) from a tag string. */
function attr(tag: string | null, name: string): string | null {
  if (!tag) return null;
  const re = new RegExp(`\\b${escapeName(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(tag);
  if (!m) return null;
  return m[2] ?? m[3] ?? null;
}

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize raw inner content: strip CDATA, decode entities, trim, cap, drop tags. */
function text(raw: string | null): string | null {
  if (raw == null) return null;
  let s = raw;
  // Unwrap CDATA sections.
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Drop any stray markup (e.g. HTML inside a title).
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s).replace(/\s+/g, " ").trim();
  if (s.length === 0) return null;
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x?[0-9a-f]+;/gi, decodeNumericEntity)
    .replace(/&amp;/g, "&");
}

function decodeNumericEntity(entity: string): string {
  const hex = /^&#x/i.test(entity);
  const digits = entity.replace(/^&#x?|;$/gi, "");
  const code = Number.parseInt(digits, hex ? 16 : 10);
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return entity;
  try {
    return String.fromCodePoint(code);
  } catch {
    return entity;
  }
}

/** Coerce a date string (RFC 822 or ISO 8601) to an ISO timestamp, or null. */
function isoDate(raw: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Parse an itunes:duration into whole seconds. Accepts "HH:MM:SS", "MM:SS", or
 * a bare seconds count. Returns null for empty/invalid input.
 */
export function parseDuration(raw: string | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  if (/^\d+$/.test(trimmed)) {
    const secs = Number.parseInt(trimmed, 10);
    return secs > 0 ? secs : null;
  }

  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p.trim()))) return null;

  const nums = parts.map((p) => Number.parseInt(p, 10));
  let total = 0;
  for (const n of nums) total = total * 60 + n;
  return total > 0 ? total : null;
}

/** Validate and normalize a candidate URL to an absolute http(s) URL, or null. */
function httpUrl(raw: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
