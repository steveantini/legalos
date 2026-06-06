import { describe, expect, it } from "vitest";

import type { ToolOption } from "./capabilities";
import { groupToolOptionsByServer, toolPickerKey } from "./tool-picker-options";

function tool(overrides: Partial<ToolOption>): ToolOption {
  return {
    serverId: "google-drive-mcp",
    serverLabel: "Google Drive",
    toolName: "search_files",
    actionLabel: "search files",
    fullLabel: "Google Drive: search files",
    description: "",
    access: "read",
    args: [],
    ...overrides,
  };
}

describe("groupToolOptionsByServer", () => {
  it("groups consecutive tools by server, preserving capability order", () => {
    const groups = groupToolOptionsByServer([
      tool({}),
      tool({
        toolName: "create_file",
        actionLabel: "create file",
        fullLabel: "Google Drive: create file",
        access: "write",
      }),
      tool({
        serverId: "google-gmail-mcp",
        serverLabel: "Gmail",
        toolName: "create_draft",
        actionLabel: "create draft",
        fullLabel: "Gmail: create draft",
        access: "write",
      }),
    ]);

    expect(groups.map((g) => g.server)).toEqual(["Google Drive", "Gmail"]);
    expect(groups[0].items).toEqual([
      {
        value: "google-drive-mcp::search_files",
        label: "Google Drive: search files",
        access: "read",
      },
      {
        value: "google-drive-mcp::create_file",
        label: "Google Drive: create file",
        access: "write",
      },
    ]);
    expect(groups[1].items[0].label).toBe("Gmail: create draft");
  });

  it("stores the same composite key the step persists", () => {
    expect(toolPickerKey("google-gmail-mcp", "create_draft")).toBe(
      "google-gmail-mcp::create_draft",
    );
  });

  it("is empty for no tools", () => {
    expect(groupToolOptionsByServer([])).toEqual([]);
  });
});
