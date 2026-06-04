import { describe, expect, it } from "vitest";

import {
  classifyMcpTool,
  partitionMcpToolsByAccess,
} from "@/lib/connections/mcp/tool-classification";
import type {
  McpToolAnnotations,
  McpToolDescriptor,
} from "@/lib/connections/providers/types";

function tool(
  name: string,
  annotations?: McpToolAnnotations,
): McpToolDescriptor {
  return { name, inputSchema: {}, ...(annotations ? { annotations } : {}) };
}

describe("classifyMcpTool (locked v1 conservative rule)", () => {
  it("is read ONLY when affirmatively read-only and not destructive", () => {
    expect(classifyMcpTool(tool("a", { readOnlyHint: true }))).toBe("read");
  });

  it("is write when readOnlyHint is false", () => {
    expect(classifyMcpTool(tool("a", { readOnlyHint: false }))).toBe("write");
  });

  it("is write when read-only but also destructive", () => {
    expect(
      classifyMcpTool(tool("a", { readOnlyHint: true, destructiveHint: true })),
    ).toBe("write");
  });

  it("is write when only destructive is set", () => {
    expect(classifyMcpTool(tool("a", { destructiveHint: true }))).toBe("write");
  });

  it("is write when annotations are absent (the conservative default)", () => {
    expect(classifyMcpTool(tool("a"))).toBe("write");
  });
});

describe("partitionMcpToolsByAccess", () => {
  it("splits a mixed list into read and write correctly", () => {
    const read1 = tool("read1", { readOnlyHint: true });
    const read2 = tool("read2", { readOnlyHint: true, destructiveHint: false });
    const write1 = tool("write1", { readOnlyHint: false });
    const write2 = tool("write2"); // unannotated ⇒ write
    const write3 = tool("write3", { readOnlyHint: true, destructiveHint: true });

    const { read, write } = partitionMcpToolsByAccess([
      read1,
      write1,
      read2,
      write2,
      write3,
    ]);
    expect(read).toEqual([read1, read2]);
    expect(write).toEqual([write1, write2, write3]);
  });
});
