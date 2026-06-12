import { describe, expect, it } from "vitest";

import { splitAnswerAndCitations } from "@/lib/support/citations";

describe("support citations", () => {
  it("strips the sources line and resolves slugs to real guide links", () => {
    const { answer, citations } = splitAnswerAndCitations(
      "Workflows run in order.\n\nSources: workflows, chat",
    );
    expect(answer).toBe("Workflows run in order.");
    expect(citations).toEqual([
      expect.objectContaining({ slug: "workflows", href: "/documentation/workflows" }),
      expect.objectContaining({ slug: "chat", href: "/documentation/chat" }),
    ]);
    expect(citations[0].title.length).toBeGreaterThan(0);
  });

  it("drops hallucinated slugs so a citation is never a dead link", () => {
    const { citations } = splitAnswerAndCitations(
      "Answer.\nSources: workspace, not-a-real-guide",
    );
    expect(citations.map((c) => c.slug)).toEqual(["workspace"]);
  });

  it("dedupes repeated slugs and tolerates casing", () => {
    const { citations } = splitAnswerAndCitations(
      "Answer.\nSources: Knowledge, knowledge, KNOWLEDGE",
    );
    expect(citations.map((c) => c.slug)).toEqual(["knowledge"]);
  });

  it("returns no citations when the model omits the line (refusals)", () => {
    const { answer, citations } = splitAnswerAndCitations(
      "I can help with how legalOS works, but not with legal advice.",
    );
    expect(citations).toEqual([]);
    expect(answer).toContain("legal advice");
  });
});
