import { describe, expect, it } from "vitest";

import {
  isBlockedAddress,
  isBlockedHostname,
  normalizeFeedUrl,
  UnsafeFeedUrlError,
} from "./feed-fetch";

describe("isBlockedAddress — IPv4", () => {
  it("blocks loopback, private, link-local, CGNAT, and unspecified ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "151.101.1.140", "172.15.0.1", "172.32.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe("isBlockedAddress — IPv6", () => {
  it("blocks loopback, unspecified, link-local, ULA, and mapped-private", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows a public IPv6 address", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("treats a non-IP string as blocked", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
});

describe("isBlockedHostname", () => {
  it("blocks internal names and literal internal IPs", () => {
    for (const host of [
      "localhost",
      "foo.localhost",
      "printer.local",
      "service.internal",
      "metadata.google.internal",
      "127.0.0.1",
      "169.254.169.254",
    ]) {
      expect(isBlockedHostname(host), host).toBe(true);
    }
  });

  it("allows ordinary public hostnames", () => {
    for (const host of ["www.lennysnewsletter.com", "feeds.megaphone.fm", "example.com"]) {
      expect(isBlockedHostname(host), host).toBe(false);
    }
  });
});

describe("normalizeFeedUrl", () => {
  it("accepts http(s) URLs and strips credentials and fragments", () => {
    expect(normalizeFeedUrl("https://user:pass@example.com/feed#top")).toBe(
      "https://example.com/feed",
    );
    expect(normalizeFeedUrl("  http://example.com/rss  ")).toBe("http://example.com/rss");
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => normalizeFeedUrl("file:///etc/passwd")).toThrow(UnsafeFeedUrlError);
    expect(() => normalizeFeedUrl("ftp://example.com")).toThrow(UnsafeFeedUrlError);
    expect(() => normalizeFeedUrl("javascript:alert(1)")).toThrow(UnsafeFeedUrlError);
  });

  it("rejects internal hosts by name and literal IP", () => {
    expect(() => normalizeFeedUrl("http://localhost:3000/feed")).toThrow(UnsafeFeedUrlError);
    expect(() => normalizeFeedUrl("http://169.254.169.254/latest/meta-data")).toThrow(
      UnsafeFeedUrlError,
    );
    expect(() => normalizeFeedUrl("http://192.168.0.10/feed")).toThrow(UnsafeFeedUrlError);
  });

  it("rejects a non-URL string", () => {
    expect(() => normalizeFeedUrl("not a url")).toThrow(UnsafeFeedUrlError);
  });

  it("defaults a missing scheme to https (the common paste)", () => {
    expect(normalizeFeedUrl("www.example.com/feed")).toBe("https://www.example.com/feed");
    expect(normalizeFeedUrl("example.com/rss")).toBe("https://example.com/rss");
    // A bare host:port is schemeless too, not mistaken for a scheme.
    expect(normalizeFeedUrl("example.com:8080/feed")).toBe(
      "https://example.com:8080/feed",
    );
  });

  it("keeps an explicit http scheme and still rejects other schemes", () => {
    expect(normalizeFeedUrl("http://example.com/feed")).toBe("http://example.com/feed");
    expect(() => normalizeFeedUrl("file:///etc/passwd")).toThrow(UnsafeFeedUrlError);
    expect(() => normalizeFeedUrl("javascript:alert(1)")).toThrow(UnsafeFeedUrlError);
  });
});
