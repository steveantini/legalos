import { describe, expect, it } from "vitest";

import { McpClientError } from "@/lib/connections/mcp/client";
import {
  MAX_TOOL_RESULT_CHARS,
  shapeToolError,
  shapeToolResult,
} from "@/lib/connections/mcp/execute-tool";
import { TokenUnavailableError } from "@/lib/connections/tokens";

const TOOL_USE_ID = "toolu_test_123";

describe("shapeToolResult (success shaping)", () => {
  it("returns the concatenated text content, no is_error", () => {
    const { toolResult, isToolError } = shapeToolResult(
      { content: [{ type: "text", text: "hello world" }] },
      TOOL_USE_ID,
    );
    expect(isToolError).toBe(false);
    expect(toolResult).toEqual({
      type: "tool_result",
      tool_use_id: TOOL_USE_ID,
      content: "hello world",
    });
    expect("is_error" in toolResult).toBe(false);
  });

  it("JSON-stringifies structured content when there is no text", () => {
    const { toolResult } = shapeToolResult(
      { structuredContent: { a: 1, b: "two" } },
      TOOL_USE_ID,
    );
    expect(toolResult.content).toBe(JSON.stringify({ a: 1, b: "two" }));
  });

  it("marks is_error when the MCP result reports a tool-level error", () => {
    const { toolResult, isToolError } = shapeToolResult(
      { isError: true, content: [{ type: "text", text: "boom" }] },
      TOOL_USE_ID,
    );
    expect(isToolError).toBe(true);
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toBe("boom");
  });

  it("caps an oversized result with a truncation note", () => {
    const big = "x".repeat(MAX_TOOL_RESULT_CHARS + 500);
    const { toolResult } = shapeToolResult(
      { content: [{ type: "text", text: big }] },
      TOOL_USE_ID,
    );
    expect(toolResult.content.startsWith("x".repeat(MAX_TOOL_RESULT_CHARS))).toBe(
      true,
    );
    expect(toolResult.content).toContain("[Result truncated:");
    expect(toolResult.content.length).toBeLessThan(big.length);
  });
});

describe("shapeToolError (error shaping)", () => {
  it("shapes an MCP client timeout into a token/PII-safe is_error result", () => {
    const { toolResult, errorCode } = shapeToolError(
      new McpClientError("timeout", "mcp.acme.com"),
      TOOL_USE_ID,
    );
    expect(errorCode).toBe("timeout");
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.tool_use_id).toBe(TOOL_USE_ID);
    expect(toolResult.content).toContain("did not respond in time");
    // Never leaks the origin/host in the model-facing message.
    expect(toolResult.content).not.toContain("mcp.acme.com");
  });

  it("shapes an unauthorized client error", () => {
    const { toolResult, errorCode } = shapeToolError(
      new McpClientError("unauthorized", null),
      TOOL_USE_ID,
    );
    expect(errorCode).toBe("unauthorized");
    expect(toolResult.content).toContain("not authorized");
  });

  it("shapes a token-unavailable error into the reconnect-style message", () => {
    const { toolResult, errorCode } = shapeToolError(
      new TokenUnavailableError("conn-1", "no_refresh_token"),
      TOOL_USE_ID,
    );
    expect(errorCode).toBe("no_refresh_token");
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain("reconnected");
  });
});
