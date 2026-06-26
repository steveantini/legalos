import { describe, expect, it } from "vitest";

import {
  buildDraftSystemPrompt,
  parseDraftOutput,
} from "./attribute-draft";
import type { QueryableAttribute } from "./structured-query-shared";

const EXISTING: QueryableAttribute[] = [
  { key: "agreement_type", label: "Agreement type", type: "enum", options: ["NDA", "MSA"] },
  { key: "effective_date", label: "Effective date", type: "date" },
];

describe("buildDraftSystemPrompt", () => {
  it("lists existing fields and the draft contract", () => {
    const prompt = buildDraftSystemPrompt(EXISTING);
    expect(prompt).toContain("Agreement type (enum)");
    expect(prompt).toContain("do not duplicate one");
    expect(prompt).toContain("Never answer the question itself");
  });
});

describe("parseDraftOutput", () => {
  it("parses a well-formed text draft", () => {
    const out = parseDraftOutput(
      '{"label": "Governing law", "type": "text", "description": "The state or country whose law governs the agreement, usually near the end."}',
    );
    expect(out).toEqual({
      label: "Governing law",
      type: "text",
      description:
        "The state or country whose law governs the agreement, usually near the end.",
    });
  });

  it("keeps enum options only for an enum type, deduped", () => {
    const out = parseDraftOutput(
      '{"label": "Jurisdiction", "type": "enum", "description": "The governing jurisdiction.", "options": ["Delaware", "New York", "Delaware"]}',
    );
    expect(out?.type).toBe("enum");
    expect(out?.options).toEqual(["Delaware", "New York"]);
  });

  it("drops options for a non-enum type", () => {
    const out = parseDraftOutput(
      '{"label": "Term length", "type": "number", "description": "The term length in months.", "options": ["12", "24"]}',
    );
    expect(out?.options).toBeUndefined();
  });

  it("defaults an unknown type to text", () => {
    const out = parseDraftOutput(
      '{"label": "Notes", "type": "paragraph", "description": "Free notes."}',
    );
    expect(out?.type).toBe("text");
  });

  it("tolerates prose around the JSON", () => {
    const out = parseDraftOutput(
      'Here is a draft:\n{"label": "Renews", "type": "boolean", "description": "Whether it auto-renews."}\nHope that helps.',
    );
    expect(out?.label).toBe("Renews");
  });

  it("returns null without a usable label or description", () => {
    expect(parseDraftOutput('{"label": "", "type": "text", "description": "x"}')).toBeNull();
    expect(parseDraftOutput('{"label": "X", "type": "text", "description": ""}')).toBeNull();
    expect(parseDraftOutput("no json here")).toBeNull();
    expect(parseDraftOutput('{"label": "X"')).toBeNull();
  });
});
