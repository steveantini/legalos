import { describe, expect, it } from "vitest";

import type { McpToolTrace } from "@/lib/connections/mcp/execute-tool";

import {
  assembleDecisionToolResult,
  buildConfirmationPayload,
  executedWriteTraceFields,
  type PendingMcpToolCall,
} from "./mcp-confirmation";

const pending: PendingMcpToolCall = {
  toolUseId: "toolu_123",
  name: "gdrive__create_file",
  input: { name: "Q3 memo", content: "secret body" },
  argKeys: ["content", "name"],
  route: {
    serverId: "google-drive-mcp",
    connectionId: "conn_1",
    tokenRef: "secret_ref_1",
    serverUrl: "https://drivemcp.googleapis.com/mcp/v1",
    originalToolName: "create_file",
  },
};

describe("buildConfirmationPayload", () => {
  it("carries the namespaced tool name and surfaces only argument key names", () => {
    const payload = buildConfirmationPayload(pending);
    expect(payload.toolName).toBe("gdrive__create_file");
    expect(payload.server).toBe("google-drive-mcp");
    expect(payload.access).toBe("write");
    expect(payload.argKeys).toEqual(["content", "name"]);
  });

  it("never leaks raw argument values or the token_ref into the payload", () => {
    const serialized = JSON.stringify(buildConfirmationPayload(pending));
    expect(serialized).not.toContain("secret body");
    expect(serialized).not.toContain("Q3 memo");
    expect(serialized).not.toContain("secret_ref_1");
  });
});

describe("assembleDecisionToolResult", () => {
  it("builds a non-error declined result on deny", () => {
    const result = assembleDecisionToolResult("deny", "toolu_123");
    expect(result.type).toBe("tool_result");
    expect(result.tool_use_id).toBe("toolu_123");
    expect(result.is_error).toBeUndefined();
    expect(result.content).toContain("declined");
  });

  it("builds an approved-but-not-executed placeholder result on approve", () => {
    const result = assembleDecisionToolResult("approve", "toolu_123");
    expect(result.tool_use_id).toBe("toolu_123");
    expect(result.is_error).toBeUndefined();
    expect(result.content).toContain("approved");
    expect(result.content).toContain("not been performed yet");
  });
});

describe("executedWriteTraceFields", () => {
  const base = {
    serverId: "google-drive-mcp",
    connectionId: "conn_1",
    originalToolName: "create_file",
    startedAt: "2026-06-04T00:00:00.000Z",
    finishedAt: "2026-06-04T00:00:02.000Z",
  };

  it("settles a successful write to done with empty attribution, no error", () => {
    const trace: McpToolTrace = { ...base, status: "ok" };
    const fields = executedWriteTraceFields(trace);
    expect(fields.status).toBe("done");
    expect(fields.finished_at).toBe("2026-06-04T00:00:02.000Z");
    expect(fields.output).toEqual({ source_ids: [] });
    expect(fields.error).toBeUndefined();
    expect(fields.error_message).toBeUndefined();
  });

  it("settles a failed write to error with the safe code + reason", () => {
    const trace: McpToolTrace = {
      ...base,
      status: "error",
      errorCode: "tool_error",
      errorMessage: "The caller does not have permission.",
    };
    const fields = executedWriteTraceFields(trace);
    expect(fields.status).toBe("error");
    expect(fields.error).toBe("tool_error");
    expect(fields.error_message).toBe("The caller does not have permission.");
    expect(fields.output).toEqual({ source_ids: [] });
  });

  it("omits error_message when the failed trace carries none", () => {
    const trace: McpToolTrace = { ...base, status: "error", errorCode: "timeout" };
    const fields = executedWriteTraceFields(trace);
    expect(fields.status).toBe("error");
    expect(fields.error).toBe("timeout");
    expect(fields.error_message).toBeUndefined();
  });
});
