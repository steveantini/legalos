import { describe, expect, it } from "vitest";

import {
  buildTranslateSystemPrompt,
  parseTranslationOutput,
} from "./structured-query-translate";
import type { QueryableAttribute } from "./structured-query-shared";

const ATTRIBUTES: QueryableAttribute[] = [
  { key: "agreement_type", label: "Agreement type", type: "enum", options: ["NDA", "MSA"] },
  { key: "effective_date", label: "Effective date", type: "date" },
  { key: "value", label: "Contract value", type: "number" },
];
const KNOWN = ATTRIBUTES.map((a) => a.key);

describe("buildTranslateSystemPrompt", () => {
  it("lists the available fields and the gap contract", () => {
    const prompt = buildTranslateSystemPrompt(ATTRIBUTES);
    expect(prompt).toContain("key: agreement_type");
    expect(prompt).toContain("one of: NDA | MSA");
    expect(prompt).toContain('"understood": false');
    expect(prompt).toContain("NEVER invent a field key");
  });
});

describe("parseTranslationOutput", () => {
  it("parses a valid understood query", () => {
    const text =
      '{"understood": true, "query": {"match": "all", "predicates": [{"kind": "text", "attribute": "agreement_type", "op": "equals", "value": "NDA"}]}}';
    const out = parseTranslationOutput(text, KNOWN);
    expect(out.kind).toBe("query");
    if (out.kind === "query") {
      expect(out.query.predicates).toHaveLength(1);
    }
  });

  it("tolerates prose around the JSON object", () => {
    const text =
      'Sure! Here you go:\n{"understood": true, "query": {"match": "all", "predicates": [], "groupBy": "agreement_type"}}\nLet me know.';
    const out = parseTranslationOutput(text, KNOWN);
    expect(out.kind).toBe("query");
  });

  it("returns a gap when the model declares one", () => {
    const text = '{"understood": false, "missing": "contract version"}';
    const out = parseTranslationOutput(text, KNOWN);
    expect(out).toEqual({ kind: "gap", missing: "contract version" });
  });

  it("degrades to a gap when an understood query references an unknown field", () => {
    const text =
      '{"understood": true, "query": {"match": "all", "predicates": [{"kind": "text", "attribute": "version", "op": "equals", "value": "3"}]}}';
    const out = parseTranslationOutput(text, KNOWN);
    expect(out).toEqual({ kind: "gap", missing: "version" });
  });

  it("degrades to a gap when groupBy references an unknown field", () => {
    const text =
      '{"understood": true, "query": {"match": "all", "predicates": [], "groupBy": "jurisdiction"}}';
    const out = parseTranslationOutput(text, KNOWN);
    expect(out).toEqual({ kind: "gap", missing: "jurisdiction" });
  });

  it("is unparseable when the query fails the zod schema", () => {
    const text =
      '{"understood": true, "query": {"match": "all", "predicates": [{"kind": "date", "attribute": "effective_date", "op": "on", "value": "June 1 2025"}]}}';
    expect(parseTranslationOutput(text, KNOWN).kind).toBe("unparseable");
  });

  it("is unparseable when there is no JSON at all", () => {
    expect(parseTranslationOutput("I cannot help with that.", KNOWN).kind).toBe("unparseable");
  });

  it("is unparseable on malformed JSON", () => {
    expect(parseTranslationOutput('{"understood": true, "query": {', KNOWN).kind).toBe(
      "unparseable",
    );
  });

  it("falls back to a generic missing label when the gap concept is blank", () => {
    const out = parseTranslationOutput('{"understood": false, "missing": ""}', KNOWN);
    expect(out).toEqual({ kind: "gap", missing: "that" });
  });
});
