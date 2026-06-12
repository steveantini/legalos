import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { DOC_PAGES } from "@/lib/marketing/documentation";
import { buildSupportCorpus, extractText } from "@/lib/support/corpus";

describe("support corpus", () => {
  const corpus = buildSupportCorpus();

  it("carries every published guide, keyed by its real slug", () => {
    for (const page of DOC_PAGES) {
      expect(corpus).toContain(`<guide slug="${page.slug}"`);
      expect(corpus).toContain(`title="${page.title}"`);
    }
  });

  it("renders bodies to plain text, not React internals or markup", () => {
    expect(corpus).not.toContain("[object Object]");
    expect(corpus).not.toContain("<p>");
    expect(corpus).not.toContain("className");
  });

  it("is substantial enough to actually ground answers", () => {
    // Tour-depth guides across 13 surfaces; a tiny corpus would mean the
    // walker silently dropped bodies.
    expect(corpus.length).toBeGreaterThan(10_000);
  });

  it("extracts headings from title props and text from children", () => {
    // Mirrors the doc bodies' real shape: a titled wrapper around blocks.
    const tree = createElement(
      "section",
      { title: "Heading" },
      createElement("p", null, "First."),
      createElement("ul", null, createElement("li", null, "Item")),
    );
    const text = extractText(tree);
    expect(text).toContain("Heading");
    expect(text).toContain("First.");
    expect(text).toContain("- Item");
  });
});
