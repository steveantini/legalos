import { describe, expect, it } from "vitest";

import { DOC_PAGES } from "@/lib/marketing/documentation";
import { HELP_TOPICS } from "@/lib/workspace/help-links";

/**
 * The in-product help map and the documentation must move in lockstep: every
 * help link resolves to a real published guide, so a guide rename without a
 * map update is a test failure, never a dead link in the product.
 */
describe("help links", () => {
  it("every help topic points at a published documentation guide", () => {
    const published = new Set(
      DOC_PAGES.map((page) => `/documentation/${page.slug}`),
    );
    for (const [topic, href] of Object.entries(HELP_TOPICS)) {
      expect(published.has(href), `topic "${topic}" → ${href}`).toBe(true);
    }
  });
});
