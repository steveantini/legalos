import { describe, expect, it } from "vitest";

import {
  appleLookupUrl,
  extractApplePodcastId,
  isApplePodcastsUrl,
  parseAppleLookupFeedUrl,
} from "./apple-podcasts";

describe("isApplePodcastsUrl", () => {
  it("recognizes podcasts.apple.com and itunes.apple.com (and www.)", () => {
    expect(isApplePodcastsUrl("https://podcasts.apple.com/us/podcast/x/id1")).toBe(true);
    expect(isApplePodcastsUrl("https://itunes.apple.com/us/podcast/x/id1")).toBe(true);
    expect(isApplePodcastsUrl("https://www.podcasts.apple.com/us/podcast/x/id1")).toBe(true);
  });

  it("rejects non-Apple hosts and invalid URLs", () => {
    expect(isApplePodcastsUrl("https://www.lennysnewsletter.com/podcast")).toBe(false);
    expect(isApplePodcastsUrl("https://apple.com/podcasts")).toBe(false);
    expect(isApplePodcastsUrl("not a url")).toBe(false);
  });
});

describe("extractApplePodcastId", () => {
  it("extracts the id from the common show URL shapes", () => {
    expect(
      extractApplePodcastId(
        "https://podcasts.apple.com/us/podcast/the-daily/id1200361736",
      ),
    ).toBe("1200361736");
    expect(
      extractApplePodcastId("https://podcasts.apple.com/podcast/id1200361736"),
    ).toBe("1200361736");
    expect(
      extractApplePodcastId("https://itunes.apple.com/gb/podcast/foo/id42"),
    ).toBe("42");
  });

  it("ignores an episode query and a trailing slash, keeping the SHOW id", () => {
    expect(
      extractApplePodcastId(
        "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000600000000",
      ),
    ).toBe("1200361736");
    expect(
      extractApplePodcastId("https://podcasts.apple.com/us/podcast/x/id777/"),
    ).toBe("777");
  });

  it("returns null for an Apple URL without an id, and for non-Apple URLs", () => {
    expect(extractApplePodcastId("https://podcasts.apple.com/us/browse")).toBeNull();
    expect(extractApplePodcastId("https://example.com/podcast/id123")).toBeNull();
    expect(extractApplePodcastId("garbage")).toBeNull();
  });
});

describe("appleLookupUrl", () => {
  it("builds the public lookup endpoint for an id", () => {
    expect(appleLookupUrl("1200361736")).toBe(
      "https://itunes.apple.com/lookup?id=1200361736",
    );
  });
});

describe("parseAppleLookupFeedUrl", () => {
  it("reads feedUrl from a typical lookup response", () => {
    const json = JSON.stringify({
      resultCount: 1,
      results: [
        {
          kind: "podcast",
          collectionName: "The Daily",
          feedUrl: "https://feeds.simplecast.com/54nAGcIl",
        },
      ],
    });
    expect(parseAppleLookupFeedUrl(json)).toBe("https://feeds.simplecast.com/54nAGcIl");
  });

  it("returns null when there are no results", () => {
    expect(parseAppleLookupFeedUrl(JSON.stringify({ resultCount: 0, results: [] }))).toBeNull();
  });

  it("returns null when the result has no feedUrl", () => {
    const json = JSON.stringify({ results: [{ kind: "podcast", collectionName: "X" }] });
    expect(parseAppleLookupFeedUrl(json)).toBeNull();
  });

  it("returns null for a non-http(s) feedUrl and for malformed JSON", () => {
    expect(
      parseAppleLookupFeedUrl(JSON.stringify({ results: [{ feedUrl: "javascript:1" }] })),
    ).toBeNull();
    expect(parseAppleLookupFeedUrl("{ not json")).toBeNull();
  });

  it("skips an entry without a feed and uses a later one that has it", () => {
    const json = JSON.stringify({
      results: [
        { kind: "podcast" },
        { kind: "podcast", feedUrl: "https://feeds.example/show.xml" },
      ],
    });
    expect(parseAppleLookupFeedUrl(json)).toBe("https://feeds.example/show.xml");
  });
});
