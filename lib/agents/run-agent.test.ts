import { describe, expect, it, vi } from "vitest";

import type { McpToolExecution } from "@/lib/connections/mcp/execute-tool";
import type { McpToolAccess } from "@/lib/connections/mcp/tool-classification";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import type { AnthropicTool } from "@/lib/llm/anthropic/chat";

import { resolveGatedOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import {
  runAgent,
  runAgentLoop,
  type ModelTurnResult,
  type RunAgentLoopDeps,
} from "./run-agent";

/** A model turn that emits a text block then (optionally) a tool_use block. */
function turn(opts: {
  text?: string;
  toolUse?: { id: string; name: string; input: unknown };
  inputTokens?: number;
  outputTokens?: number;
}): ModelTurnResult {
  const content: ModelTurnResult["content"] = [];
  if (opts.text) content.push({ type: "text", text: opts.text });
  if (opts.toolUse) {
    content.push({
      type: "tool_use",
      id: opts.toolUse.id,
      name: opts.toolUse.name,
      input: opts.toolUse.input,
    } as ModelTurnResult["content"][number]);
  }
  return {
    stopReason: opts.toolUse ? "tool_use" : "end_turn",
    content,
    usage: {
      input_tokens: opts.inputTokens ?? 0,
      output_tokens: opts.outputTokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      web_search_requests: 0,
    },
  };
}

const ROUTE: McpToolRoute = {
  serverId: "gdrive",
  connectionId: "conn-1",
  tokenRef: "tok-1",
  serverUrl: "https://example.test/mcp",
  originalToolName: "search_files",
};

/** A fake successful read tool execution (executeMcpTool's never-throws shape). */
function okExecution(toolUseId: string): McpToolExecution {
  return {
    toolResult: {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: "two files found",
    },
    trace: {
      serverId: "gdrive",
      connectionId: "conn-1",
      originalToolName: "search_files",
      status: "ok",
      startedAt: "2026-06-05T00:00:00.000Z",
      finishedAt: "2026-06-05T00:00:01.000Z",
    },
  };
}

function baseDeps(over: Partial<RunAgentLoopDeps>): RunAgentLoopDeps {
  return {
    baseMessages: [{ role: "user", content: "<user_input>\nfind files\n</user_input>" }],
    offeredTools: [],
    routingMap: {},
    accessByName: new Map(),
    maxRounds: 8,
    wallClockMs: 240_000,
    now: () => 0,
    modelTurn: async () => turn({ text: "done" }),
    toolExec: async () => okExecution("unused"),
    ...over,
  };
}

describe("runAgentLoop", () => {
  it("runs a read tool then returns output, tool trace, and summed usage", async () => {
    const readTool: AnthropicTool = {
      name: "gdrive__search_files",
      description: "search",
      input_schema: { type: "object", properties: {} },
    };
    const calls: ModelTurnResult[] = [
      turn({
        text: "Looking. ",
        toolUse: { id: "tu_1", name: "gdrive__search_files", input: { query: "x" } },
        inputTokens: 10,
        outputTokens: 5,
      }),
      turn({ text: "Found two.", inputTokens: 7, outputTokens: 3 }),
    ];
    let i = 0;
    const toolExec = vi.fn(async () => okExecution("tu_1"));

    const result = await runAgentLoop(
      baseDeps({
        offeredTools: [readTool],
        routingMap: { gdrive__search_files: ROUTE },
        accessByName: new Map<string, McpToolAccess>([
          ["gdrive__search_files", "read"],
        ]),
        modelTurn: async () => calls[i++],
        toolExec,
      }),
    );

    expect(toolExec).toHaveBeenCalledTimes(1);
    expect(result.output).toBe("Looking. Found two.");
    expect(result.stopReason).toBe("end_turn");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: "gdrive__search_files",
      access: "read",
      status: "done",
      server: "gdrive",
    });
    // Argument VALUES are never recorded — only sorted key names.
    expect(result.toolCalls[0].input).toEqual({ argKeys: ["query"] });
    expect(result.usage.tokensIn).toBe(17);
    expect(result.usage.tokensOut).toBe(8);
    expect(result.usage.mcpToolCallCount).toBe(1);
  });

  it("with no tools offered, takes a single no-tools turn and runs nothing", async () => {
    const modelTurn = vi.fn(async (_messages, tools) => {
      // Governance gating respected: the model is offered NO tools.
      expect(tools).toBeUndefined();
      return turn({ text: "no tools answer" });
    });
    const toolExec = vi.fn(async () => okExecution("x"));

    const result = await runAgentLoop(
      baseDeps({ offeredTools: [], modelTurn, toolExec }),
    );

    expect(modelTurn).toHaveBeenCalledTimes(1);
    expect(toolExec).not.toHaveBeenCalled();
    expect(result.toolCalls).toHaveLength(0);
    expect(result.output).toBe("no tools answer");
  });

  it("NEVER executes a write tool_use — refuses it as not-performed", async () => {
    const calls: ModelTurnResult[] = [
      turn({
        text: "I'll write. ",
        toolUse: { id: "tu_w", name: "gdrive__create_file", input: { name: "x" } },
      }),
      turn({ text: "Acknowledged." }),
    ];
    let i = 0;
    const toolExec = vi.fn(async () => okExecution("tu_w"));

    const result = await runAgentLoop(
      baseDeps({
        // A write somehow reaches the loop; the guard must refuse it.
        routingMap: { gdrive__create_file: { ...ROUTE, originalToolName: "create_file" } },
        accessByName: new Map<string, McpToolAccess>([
          ["gdrive__create_file", "write"],
        ]),
        modelTurn: async () => calls[i++],
        toolExec,
      }),
    );

    expect(toolExec).not.toHaveBeenCalled();
    expect(result.toolCalls[0]).toMatchObject({
      name: "gdrive__create_file",
      access: "write",
      status: "error",
      error: "write_not_executed",
    });
  });
});

describe("resolveGatedOrgMcpTools (flag gate)", () => {
  it("returns an empty, not-engaged tool set when the flag is off (no DB read)", async () => {
    const prior = process.env.MCP_AGENT_TOOLS_ENABLED;
    delete process.env.MCP_AGENT_TOOLS_ENABLED;
    try {
      const gated = await resolveGatedOrgMcpTools();
      expect(gated.loopEngaged).toBe(false);
      expect(gated.toolDefs).toHaveLength(0);
      expect(gated.accessByName.size).toBe(0);
    } finally {
      if (prior !== undefined) process.env.MCP_AGENT_TOOLS_ENABLED = prior;
    }
  });
});

describe("runAgent (typed failure, never throws)", () => {
  const agent = {
    id: "agent-1",
    system_prompt: "You are a test agent.",
    tools_enabled: null,
  };

  it("fails cleanly on an unsupported model vendor without touching the network", async () => {
    const result = await runAgent({
      agent: { ...agent, model: "openai/gpt-4o" },
      organizationId: "org-1",
      userId: "user-1",
      input: "hello",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Unsupported model vendor");
  });

  it("fails cleanly (does not throw) on a malformed model id", async () => {
    const result = await runAgent({
      agent: { ...agent, model: "anthropic/bad/model" },
      organizationId: "org-1",
      userId: "user-1",
      input: "hello",
    });
    expect(result.ok).toBe(false);
  });
});
