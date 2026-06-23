import { describe, expect, it } from "vitest";

import { discoverFeedLinks, parseFeed, parseDuration } from "./feed-parser";

describe("parseFeed — RSS 2.0", () => {
  const rss = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Lenny's Newsletter</title>
        <link>https://www.lennysnewsletter.com</link>
        <image><url>https://img.example/logo.png</url></image>
        <item>
          <title><![CDATA[How to ship faster]]></title>
          <link>https://www.lennysnewsletter.com/p/how-to-ship-faster</link>
          <pubDate>Tue, 10 Jun 2026 09:00:00 GMT</pubDate>
        </item>
        <item>
          <title>An older post</title>
          <link>https://www.lennysnewsletter.com/p/older</link>
          <pubDate>Tue, 03 Jun 2026 09:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

  it("reads the channel title, site, and image", () => {
    const feed = parseFeed(rss);
    expect(feed?.title).toBe("Lenny's Newsletter");
    expect(feed?.siteUrl).toBe("https://www.lennysnewsletter.com/");
    expect(feed?.imageUrl).toBe("https://img.example/logo.png");
  });

  it("returns the FIRST item as the latest, decoding CDATA", () => {
    const item = parseFeed(rss)?.latestItem;
    expect(item?.title).toBe("How to ship faster");
    expect(item?.url).toBe("https://www.lennysnewsletter.com/p/how-to-ship-faster");
    expect(item?.publishedAt).toBe("2026-06-10T09:00:00.000Z");
  });

  it("falls back to the channel image for an item without its own", () => {
    expect(parseFeed(rss)?.latestItem?.imageUrl).toBe("https://img.example/logo.png");
  });
});

describe("parseFeed — podcast (iTunes)", () => {
  const podcast = `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
    <channel>
      <title>The Vergecast</title>
      <link>https://www.theverge.com/the-vergecast</link>
      <itunes:image href="https://img.example/show.jpg" />
      <item>
        <title>Episode 200</title>
        <link>https://example.com/ep/200</link>
        <pubDate>Fri, 13 Jun 2026 12:00:00 GMT</pubDate>
        <itunes:duration>1:02:33</itunes:duration>
        <itunes:image href="https://img.example/ep200.jpg" />
        <enclosure url="https://audio.example/200.mp3" type="audio/mpeg" length="1000" />
      </item>
    </channel>
  </rss>`;

  it("reads itunes:image as the channel image", () => {
    expect(parseFeed(podcast)?.imageUrl).toBe("https://img.example/show.jpg");
  });

  it("reads the episode duration in seconds and the episode image", () => {
    const item = parseFeed(podcast)?.latestItem;
    expect(item?.durationSeconds).toBe(3753); // 1*3600 + 2*60 + 33
    expect(item?.imageUrl).toBe("https://img.example/ep200.jpg");
  });
});

describe("parseFeed — Atom", () => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
    <title>Some Blog</title>
    <link rel="self" href="https://blog.example/feed.xml" />
    <link rel="alternate" href="https://blog.example/" />
    <icon>https://blog.example/icon.png</icon>
    <entry>
      <title>Newest entry</title>
      <link rel="alternate" href="https://blog.example/newest" />
      <published>2026-06-12T08:30:00Z</published>
    </entry>
    <entry>
      <title>Older entry</title>
      <link href="https://blog.example/older" />
      <updated>2026-06-01T08:30:00Z</updated>
    </entry>
  </feed>`;

  it("prefers the alternate link over self for the site and item", () => {
    const feed = parseFeed(atom);
    expect(feed?.title).toBe("Some Blog");
    expect(feed?.siteUrl).toBe("https://blog.example/");
    expect(feed?.imageUrl).toBe("https://blog.example/icon.png");
    expect(feed?.latestItem?.url).toBe("https://blog.example/newest");
    expect(feed?.latestItem?.publishedAt).toBe("2026-06-12T08:30:00.000Z");
  });
});

describe("parseFeed — resilience", () => {
  it("returns null for empty or non-feed input", () => {
    expect(parseFeed("")).toBeNull();
    expect(parseFeed("not xml at all")).toBeNull();
    expect(parseFeed("<html><body>hi</body></html>")).toBeNull();
  });

  it("parses a feed with a missing item date or link to nulls, not a throw", () => {
    const feed = parseFeed(
      `<rss><channel><title>T</title><item><title>Only a title</title></item></channel></rss>`,
    );
    expect(feed?.latestItem?.title).toBe("Only a title");
    expect(feed?.latestItem?.url).toBeNull();
    expect(feed?.latestItem?.publishedAt).toBeNull();
  });

  it("decodes numeric and named entities in titles", () => {
    const feed = parseFeed(
      `<rss><channel><title>News &amp; Notes</title><item><title>A &#8220;quote&#8221; &amp; more</title><link>https://x.example/a</link></item></channel></rss>`,
    );
    expect(feed?.title).toBe("News & Notes");
    expect(feed?.latestItem?.title).toBe("A “quote” & more");
  });

  it("ignores a non-http(s) item link", () => {
    const feed = parseFeed(
      `<rss><channel><title>T</title><item><title>X</title><link>javascript:alert(1)</link></item></channel></rss>`,
    );
    expect(feed?.latestItem?.url).toBeNull();
  });
});

describe("discoverFeedLinks", () => {
  const base = "https://www.lennysnewsletter.com/podcast";

  it("finds a single advertised RSS feed and resolves a relative href", () => {
    const html = `<html><head>
      <title>Lenny's Podcast</title>
      <link rel="alternate" type="application/rss+xml" title="Podcast" href="/podcast/feed">
    </head><body>...</body></html>`;
    expect(discoverFeedLinks(html, base)).toEqual([
      "https://www.lennysnewsletter.com/podcast/feed",
    ]);
  });

  it("returns multiple feeds in document order (primary first)", () => {
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" href="https://x.example/main.xml">
      <link rel="alternate" type="application/atom+xml" href="https://x.example/comments.atom">
    </head>`;
    expect(discoverFeedLinks(html, base)).toEqual([
      "https://x.example/main.xml",
      "https://x.example/comments.atom",
    ]);
  });

  it("returns [] when the page advertises no feed", () => {
    const html = `<head>
      <link rel="stylesheet" href="/style.css">
      <link rel="icon" href="/favicon.ico">
    </head>`;
    expect(discoverFeedLinks(html, base)).toEqual([]);
  });

  it("ignores non-feed link types and dedupes repeats", () => {
    const html = `<head>
      <link rel="alternate" type="text/html" href="https://x.example/page">
      <link rel="alternate" type="application/rss+xml" href="https://x.example/feed">
      <link rel="alternate" type="application/rss+xml" href="https://x.example/feed">
    </head>`;
    expect(discoverFeedLinks(html, base)).toEqual(["https://x.example/feed"]);
  });

  it("skips an explicit non-alternate rel and a non-http(s) href", () => {
    const html = `<head>
      <link rel="self" type="application/rss+xml" href="https://x.example/self">
      <link rel="alternate" type="application/rss+xml" href="javascript:void(0)">
      <link type="application/atom+xml" href="https://x.example/no-rel.atom">
    </head>`;
    // rel="self" skipped, javascript: skipped, missing-rel-but-typed kept.
    expect(discoverFeedLinks(html, base)).toEqual(["https://x.example/no-rel.atom"]);
  });

  it("returns [] for empty input", () => {
    expect(discoverFeedLinks("", base)).toEqual([]);
  });
});

describe("parseDuration", () => {
  it("parses H:MM:SS, M:SS, and bare seconds", () => {
    expect(parseDuration("1:02:33")).toBe(3753);
    expect(parseDuration("12:30")).toBe(750);
    expect(parseDuration("90")).toBe(90);
  });

  it("returns null for empty or malformed input", () => {
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
  });
});
