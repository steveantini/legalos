import { describe, expect, it } from "vitest";

import { toolLabel } from "./tool-display";

describe("toolLabel", () => {
  it("labels known first-party MCP tools as '<Server>: <action>'", () => {
    expect(toolLabel("gdrive__search_files").full).toBe(
      "Google Drive: search files",
    );
    expect(toolLabel("gmail__create_draft").full).toBe("Gmail: create draft");
    expect(toolLabel("gcal__list_events").full).toBe("Calendar: list events");
  });

  it("splits the label into server and action parts", () => {
    const label = toolLabel("gdrive__search_files");
    expect(label.server).toBe("Google Drive");
    expect(label.action).toBe("search files");
  });

  it("labels catalog connector tools with the vendor's real capitalization", () => {
    expect(toolLabel("courtlistener__search_dockets").full).toBe(
      "CourtListener: search dockets",
    );
    expect(toolLabel("docusign__list_agreements").full).toBe(
      "DocuSign: list agreements",
    );
    expect(toolLabel("imanage__search_documents").full).toBe(
      "iManage: search documents",
    );
  });

  it("keeps the established 'Web search' label for the hosted tool", () => {
    const label = toolLabel("web_search");
    expect(label.full).toBe("Web search");
    expect(label.server).toBeNull();
    expect(label.action).toBe("Web search");
  });

  it("humanizes a derived (self-hosted) prefix, dropping the routing hash", () => {
    // tool-mapping mints derived prefixes as `<slug>_<6-char hash>`.
    expect(toolLabel("acme_a1b2c3__do_thing").full).toBe("Acme: do thing");
  });

  it("prefers an explicit server display name when provided", () => {
    expect(toolLabel("acme_a1b2c3__do_thing", "Acme Corp").full).toBe(
      "Acme Corp: do thing",
    );
  });

  it("falls back to humanizing an unmapped bare name", () => {
    const label = toolLabel("some_tool");
    expect(label.full).toBe("some tool");
    expect(label.server).toBeNull();
  });

  it("treats a leading separator (empty prefix) as a bare action", () => {
    const label = toolLabel("__orphan");
    expect(label.full).toBe("orphan");
    expect(label.server).toBeNull();
    expect(label.action).toBe("orphan");
  });
});
