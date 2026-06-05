import { describe, expect, it } from "vitest";

import { parseC4LSkillMarkdown } from "./c4l-fetch";

// A folded YAML scalar (`description: >`) + body, the real C4L SKILL.md shape.
const SKILL_MD = `---
name: nda-review
description: >
  Fast triage of inbound NDAs into GREEN / YELLOW / RED so the team only
  spends lawyer time on the ones that need it.
user-invocable: false
---

# NDA Review

The body becomes the system prompt.
`;

describe("parseC4LSkillMarkdown", () => {
  it("parses name, first-paragraph description, and body, matching the CLI import", () => {
    const parsed = parseC4LSkillMarkdown("commercial-legal", "nda-review", SKILL_MD);
    expect(parsed).not.toBeNull();
    expect(parsed!.plugin).toBe("commercial-legal");
    expect(parsed!.skill).toBe("nda-review");
    expect(parsed!.name).toBe("nda-review");
    // Folded scalar collapses to one paragraph; the first paragraph is the whole thing.
    expect(parsed!.description).toContain("Fast triage of inbound NDAs");
    expect(parsed!.description).not.toContain("---");
    expect(parsed!.systemPrompt).toBe(
      "# NDA Review\n\nThe body becomes the system prompt.",
    );
  });

  it("takes only the FIRST paragraph of a multi-paragraph description", () => {
    const md = `---
name: x
description: |
  First paragraph here.

  Second paragraph should be dropped.
---
Body.`;
    const parsed = parseC4LSkillMarkdown("p", "x", md);
    expect(parsed!.description).toBe("First paragraph here.");
  });

  it("returns null when the frontmatter has no name", () => {
    const md = `---
description: no name here
---
Body.`;
    expect(parseC4LSkillMarkdown("p", "x", md)).toBeNull();
  });

  it("returns null on malformed frontmatter rather than throwing", () => {
    const md = `---
name: [unterminated
---
Body.`;
    expect(parseC4LSkillMarkdown("p", "x", md)).toBeNull();
  });
});
