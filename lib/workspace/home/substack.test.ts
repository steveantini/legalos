import { describe, expect, it } from "vitest";

import { classifySubstackUrl, substackHandleUrl } from "./substack";

describe("classifySubstackUrl", () => {
  it("strips a stray www. from a single-label publication subdomain", () => {
    const result = classifySubstackUrl("https://www.natesnewsletter.substack.com");
    expect(result).toEqual({
      kind: "www-subdomain",
      fixed: "https://natesnewsletter.substack.com/",
    });
  });

  it("keeps a path and query when correcting the www. subdomain", () => {
    const result = classifySubstackUrl("https://www.natesnewsletter.substack.com/feed");
    expect(result).toEqual({
      kind: "www-subdomain",
      fixed: "https://natesnewsletter.substack.com/feed",
    });
  });

  it("detects a profile link and extracts the handle", () => {
    expect(classifySubstackUrl("https://substack.com/@natesnewsletter")).toEqual({
      kind: "profile",
      handle: "natesnewsletter",
    });
    // Lenient about a trailing path on the profile.
    expect(classifySubstackUrl("https://substack.com/@natesnewsletter/notes")).toEqual({
      kind: "profile",
      handle: "natesnewsletter",
    });
    // www.substack.com host counts too.
    expect(classifySubstackUrl("https://www.substack.com/@handle")).toEqual({
      kind: "profile",
      handle: "handle",
    });
  });

  it("detects a reader-app post link", () => {
    expect(
      classifySubstackUrl("https://substack.com/home/post/p-167891234"),
    ).toEqual({ kind: "reader-post" });
  });

  it("leaves an ordinary publication subdomain (no www.) untouched", () => {
    expect(classifySubstackUrl("https://natesnewsletter.substack.com")).toEqual({
      kind: "none",
    });
    expect(classifySubstackUrl("https://natesnewsletter.substack.com/feed")).toEqual({
      kind: "none",
    });
  });

  it("does not touch non-Substack URLs or a www. custom domain", () => {
    expect(classifySubstackUrl("https://www.lennysnewsletter.com/podcast")).toEqual({
      kind: "none",
    });
    expect(classifySubstackUrl("https://example.com/feed")).toEqual({ kind: "none" });
    expect(classifySubstackUrl("not a url")).toEqual({ kind: "none" });
  });

  it("does not strip www. from a deeper (multi-label) substack host", () => {
    // www.a.b.substack.com is not the simple www.<label>.substack.com shape.
    expect(classifySubstackUrl("https://www.a.b.substack.com")).toEqual({
      kind: "none",
    });
  });

  it("treats substack.com root and other paths as none", () => {
    expect(classifySubstackUrl("https://substack.com")).toEqual({ kind: "none" });
    expect(classifySubstackUrl("https://substack.com/browse")).toEqual({ kind: "none" });
  });
});

describe("substackHandleUrl", () => {
  it("builds the candidate publication URL for a handle", () => {
    expect(substackHandleUrl("natesnewsletter")).toBe(
      "https://natesnewsletter.substack.com",
    );
  });
});
