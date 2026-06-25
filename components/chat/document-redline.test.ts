import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { compareDocuments } from "@/lib/deterministic/compare";
import {
  coerceRedlinePayload,
  type RedlinePayload,
} from "@/lib/agents/pre-steps/document-compare";

import { DocumentRedline } from "./document-redline";

/** Build a RedlinePayload from the real engine (the same shape the pre-step carries). */
function payload(
  oldText: string,
  newText: string,
  over: Partial<RedlinePayload> = {},
): RedlinePayload {
  const r = compareDocuments({ text: oldText }, { text: newText });
  return {
    segments: r.segments,
    summary: r.summary,
    truncated: r.truncated,
    originalLabel: "original.docx",
    revisedLabel: "revised.docx",
    ...over,
  };
}

function render(p: RedlinePayload): string {
  return renderToStaticMarkup(createElement(DocumentRedline, { redline: p }));
}

describe("DocumentRedline", () => {
  it("renders a replacement as struck old text followed by inserted new text", () => {
    const html = render(payload("Net 30", "Net 60"));
    // Semantic ins/del, in order: old struck, new inserted.
    expect(html).toContain("<del");
    expect(html).toContain("<ins");
    expect(html).toMatch(/<del[^>]*>30<\/del><ins[^>]*>60<\/ins>/);
    // The unchanged anchor text is plain (present, not marked).
    expect(html).toContain("Net ");
  });

  it("renders a pure insertion with <ins> and no deletion", () => {
    const html = render(payload("alpha beta", "alpha gamma beta"));
    expect(html).toContain("<ins");
    expect(html).toContain("gamma");
    expect(html).not.toContain("<del");
  });

  it("renders a pure deletion with <del> and no insertion", () => {
    const html = render(payload("alpha gamma beta", "alpha beta"));
    expect(html).toContain("<del");
    expect(html).toContain("gamma");
    expect(html).not.toContain("<ins");
  });

  it("uses semantic ins/del so changes are distinguishable without color", () => {
    const html = render(payload("Net 30", "Net 60"));
    // The marks are real <ins>/<del> elements (screen-reader semantics) and carry
    // underline / line-through (a non-color cue), not color alone.
    expect(html).toContain("<ins");
    expect(html).toContain("<del");
    expect(html).toContain("underline");
    expect(html).toContain("line-through");
  });

  it("wraps long unbroken tokens (overflow-wrap on the flow container)", () => {
    const longToken = "x".repeat(400);
    const html = render(payload(`a ${longToken} b`, `a ${longToken} c`));
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("shows an explicit no-changes state for identical documents", () => {
    const p = payload("Net 30", "Net 30");
    expect(p.summary.changed).toBe(false);
    const html = render(p);
    expect(html).toContain("No changes");
    expect(html).toContain("identical to the original");
    // No marks rendered when there is nothing to mark.
    expect(html).not.toContain("<ins");
    expect(html).not.toContain("<del");
  });

  it("surfaces a truncation notice when a side hit the size cap", () => {
    const original = render(
      payload("Net 30", "Net 60", { truncated: { old: true, new: false } }),
    );
    expect(original).toContain("original document exceeded the size limit");

    const both = render(
      payload("Net 30", "Net 60", { truncated: { old: true, new: true } }),
    );
    expect(both).toContain("Both documents exceeded the size limit");

    // No notice when neither side was capped.
    const clean = render(payload("Net 30", "Net 60"));
    expect(clean).not.toContain("exceeded the size limit");
  });

  it("labels which document is original and which is revised", () => {
    const html = render(payload("Net 30", "Net 60"));
    expect(html).toContain("original.docx");
    expect(html).toContain("revised.docx");
  });

  it("renders the same redline after a persist + rehydrate round-trip (D-193)", () => {
    // The reload path: a live payload is stored to jsonb, read back as unknown,
    // coerced, and rendered. It must produce the same marks it did live, proving
    // the redline survives reload from the persisted change set (no recompute).
    const live = payload("Net 30", "Net 60");
    const fromColumn = JSON.parse(JSON.stringify(live)) as unknown;
    const rehydrated = coerceRedlinePayload(fromColumn);
    expect(rehydrated).toBeDefined();
    const liveHtml = render(live);
    const reloadHtml = render(rehydrated!);
    expect(reloadHtml).toBe(liveHtml);
    expect(reloadHtml).toMatch(/<del[^>]*>30<\/del><ins[^>]*>60<\/ins>/);
  });
});
