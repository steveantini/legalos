import { describe, expect, it } from "vitest";

import {
  parseBoxFolderInfo,
  parseBoxPage,
  parseDriveFolderInfo,
  parseDrivePage,
  toolResultJson,
} from "@/lib/knowledge/enumeration-parse";

/** Wrap a payload the way the MCP SDK returns tool results (text block). */
function asTextResult(payload: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

describe("toolResultJson", () => {
  it("prefers structuredContent, falls back to the first text block", () => {
    expect(toolResultJson({ structuredContent: { a: 1 } })).toEqual({ a: 1 });
    expect(toolResultJson(asTextResult({ b: 2 }))).toEqual({ b: 2 });
  });

  it("returns null for unparseable text and non-objects", () => {
    expect(toolResultJson({ content: [{ type: "text", text: "not json" }] })).toBeNull();
    expect(toolResultJson(null)).toBeNull();
  });
});

describe("parseDrivePage", () => {
  it("parses the verified-live shape: files with stable ids, folder detection, pagination", () => {
    const page = parseDrivePage(
      asTextResult({
        files: [
          {
            id: "f1",
            title: "Playbooks",
            mimeType: DRIVE_FOLDER_MIME,
            modifiedTime: "2026-06-01T00:00:00Z",
          },
          {
            id: "d1",
            title: "MSA.pdf",
            mimeType: "application/pdf",
            modifiedTime: "2026-05-01T00:00:00Z",
            viewUrl: "https://drive.google.com/file/d/d1",
          },
        ],
        nextPageToken: "tok",
      }),
    );
    expect(page.nextPageToken).toBe("tok");
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0]).toMatchObject({ id: "f1", isFolder: true });
    expect(page.entries[1]).toMatchObject({
      id: "d1",
      name: "MSA.pdf",
      isFolder: false,
      url: "https://drive.google.com/file/d/d1",
    });
  });

  it("skips malformed entries and throws on an unrecognizable payload", () => {
    const page = parseDrivePage(
      asTextResult({ files: [{ title: "no id" }, { id: "ok", title: "x" }] }),
    );
    expect(page.entries.map((e) => e.id)).toEqual(["ok"]);
    expect(() => parseDrivePage(asTextResult({ nope: true }))).toThrow();
  });
});

describe("parseDriveFolderInfo", () => {
  it("reads name and parent, accepting a wrapped entity", () => {
    expect(
      parseDriveFolderInfo(asTextResult({ id: "x", title: "Legal", parentId: "p1" })),
    ).toEqual({ name: "Legal", parentId: "p1" });
    expect(
      parseDriveFolderInfo(asTextResult({ file: { title: "Legal", parentId: "p1" } })),
    ).toEqual({ name: "Legal", parentId: "p1" });
    expect(parseDriveFolderInfo(asTextResult({ id: "x" }))).toBeNull();
  });
});

describe("parseBoxPage", () => {
  it("parses entries, skips web links, and paginates by offset", () => {
    const page = parseBoxPage(
      asTextResult({
        entries: [
          { id: 11, name: "Contracts", type: "folder" },
          { id: "22", name: "NDA.docx", type: "file", size: 1234 },
          { id: "33", name: "Link", type: "web_link" },
        ],
        total_count: 150,
      }),
      0,
      100,
    );
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0]).toMatchObject({ id: "11", isFolder: true });
    expect(page.entries[1]).toMatchObject({ id: "22", sizeBytes: 1234 });
    // 3 of 150 seen: more pages remain, token = next offset.
    expect(page.nextPageToken).toBe("3");
  });

  it("ends pagination when the count is exhausted or the page is short", () => {
    const last = parseBoxPage(
      asTextResult({ entries: [{ id: "1", name: "a", type: "file" }], total_count: 1 }),
      0,
      100,
    );
    expect(last.nextPageToken).toBeNull();

    const short = parseBoxPage(
      asTextResult({ entries: [{ id: "1", name: "a", type: "file" }] }),
      0,
      100,
    );
    expect(short.nextPageToken).toBeNull();
  });
});

describe("parseBoxFolderInfo", () => {
  it("reads name and parent defensively", () => {
    expect(
      parseBoxFolderInfo(asTextResult({ name: "Deals", parent: { id: "0" } })),
    ).toEqual({ name: "Deals", parentId: "0" });
    expect(parseBoxFolderInfo(asTextResult({ parent: { id: "0" } }))).toBeNull();
  });
});
