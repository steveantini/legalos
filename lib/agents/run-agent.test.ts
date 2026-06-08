import { describe, expect, it, vi } from "vitest";

import type { McpToolExecution } from "@/lib/connections/mcp/execute-tool";
import type { McpToolAccess } from "@/lib/connections/mcp/tool-classification";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import type { AnthropicTool } from "@/lib/llm/anthropic/chat";

import { resolveGatedOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import {
  resumeAgentLoop,
  runAgent,
  runAgentLoop,
  type ModelTurnResult,
  type RunAgentLoopDeps,
  type RunAgentLoopOutcome,
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

// ---- The pausable loop (delight pass D1) -----------------------------------

/** A model turn carrying an arbitrary sequence of content blocks. */
function turnBlocks(
  text: string,
  toolUses: Array<{ id: string; name: string; input: unknown }>,
  tokens?: { in?: number; out?: number },
): ModelTurnResult {
  const content: ModelTurnResult["content"] = [{ type: "text", text }];
  for (const tu of toolUses) {
    content.push({
      type: "tool_use",
      id: tu.id,
      name: tu.name,
      input: tu.input,
    } as ModelTurnResult["content"][number]);
  }
  return {
    stopReason: toolUses.length > 0 ? "tool_use" : "end_turn",
    content,
    usage: {
      input_tokens: tokens?.in ?? 0,
      output_tokens: tokens?.out ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      web_search_requests: 0,
    },
  };
}

const WRITE_ROUTE: McpToolRoute = { ...ROUTE, originalToolName: "create_file" };

/** A fake successful execution for any tool_use id (read or approved write). */
function okExecutionFor(toolUseId: string, content: string): McpToolExecution {
  return {
    toolResult: { type: "tool_result", tool_use_id: toolUseId, content },
    trace: {
      serverId: "gdrive",
      connectionId: "conn-1",
      originalToolName: "create_file",
      status: "ok",
      startedAt: "2026-06-06T00:00:00.000Z",
      finishedAt: "2026-06-06T00:00:01.000Z",
    },
  };
}

/** Narrow a loop outcome to paused, failing the test loudly otherwise. */
function expectPaused(outcome: RunAgentLoopOutcome) {
  expect(outcome.status).toBe("paused");
  if (outcome.status !== "paused") throw new Error("expected a paused outcome");
  return outcome;
}

const PAUSE_ROUTING = {
  gdrive__search_files: ROUTE,
  gdrive__create_file: WRITE_ROUTE,
};
const PAUSE_ACCESS = new Map<string, McpToolAccess>([
  ["gdrive__search_files", "read"],
  ["gdrive__create_file", "write"],
]);

describe("runAgentLoop (writes: 'pause')", () => {
  it("pauses on a write with the FULL proposed action and does not execute it", async () => {
    // One turn: a read, then the write, then another read AFTER the write —
    // proving pre-write reads execute, the write pauses, and later blocks wait.
    const calls: ModelTurnResult[] = [
      turnBlocks(
        "Working. ",
        [
          { id: "tu_r1", name: "gdrive__search_files", input: { query: "nda" } },
          {
            id: "tu_w",
            name: "gdrive__create_file",
            input: { name: "draft.md", content: "PRIVILEGED CONTENT" },
          },
          { id: "tu_r2", name: "gdrive__search_files", input: { query: "follow" } },
        ],
        { in: 10, out: 5 },
      ),
    ];
    let i = 0;
    const toolExec = vi.fn(async ({ toolUseId }: { toolUseId: string }) =>
      okExecutionFor(toolUseId, "read result"),
    );

    const outcome = await runAgentLoop(
      baseDeps({
        writes: "pause",
        routingMap: PAUSE_ROUTING,
        accessByName: PAUSE_ACCESS,
        modelTurn: async () => calls[i++],
        toolExec,
      }),
    );

    const paused = expectPaused(outcome);
    // Only the pre-write read executed; the write and the post-write read did not.
    expect(toolExec).toHaveBeenCalledTimes(1);
    expect(toolExec.mock.calls[0][0]).toMatchObject({ toolUseId: "tu_r1" });

    // Fork 2 fidelity: the pending write carries the agent's ACTUAL chosen args
    // (full values) alongside the PII-safe sorted argKeys — the chat-shared shape.
    expect(paused.pendingWrite).toEqual({
      toolUseId: "tu_w",
      name: "gdrive__create_file",
      route: WRITE_ROUTE,
      input: { name: "draft.md", content: "PRIVILEGED CONTENT" },
      argKeys: ["content", "name"],
    });

    // Resumable state: the paused assistant turn is last, the pre-write read's
    // result is preserved, and the trace marks the write awaiting confirmation
    // with argKeys only (no values).
    expect(paused.pauseState.pendingToolUseId).toBe("tu_w");
    expect(paused.pauseState.partialToolResults).toHaveLength(1);
    expect(paused.pauseState.partialToolResults[0].tool_use_id).toBe("tu_r1");
    expect(
      paused.pauseState.loopMessages[paused.pauseState.loopMessages.length - 1]
        .role,
    ).toBe("assistant");
    expect(paused.toolCalls).toHaveLength(2);
    expect(paused.toolCalls[1]).toMatchObject({
      id: "tu_w",
      status: "awaiting_confirmation",
      access: "write",
    });
    expect(paused.toolCalls[1].input).toEqual({ argKeys: ["content", "name"] });
    expect(paused.usage.tokensIn).toBe(10);
  });

  it("resume APPROVE executes the write once, feeds the real result back, and completes", async () => {
    // Reach a pause first (same turn shape as above).
    const pauseCalls = [
      turnBlocks(
        "Working. ",
        [
          { id: "tu_r1", name: "gdrive__search_files", input: { query: "nda" } },
          { id: "tu_w", name: "gdrive__create_file", input: { name: "draft.md" } },
          { id: "tu_r2", name: "gdrive__search_files", input: { query: "follow" } },
        ],
        { in: 10, out: 5 },
      ),
    ];
    let i = 0;
    const paused = expectPaused(
      await runAgentLoop(
        baseDeps({
          writes: "pause",
          routingMap: PAUSE_ROUTING,
          accessByName: PAUSE_ACCESS,
          modelTurn: async () => pauseCalls[i++],
          toolExec: async ({ toolUseId }) => okExecutionFor(toolUseId, "read result"),
        }),
      ),
    );

    // Resume with approve: the injected executor runs the write, the post-write
    // read executes, and the model takes a closing turn.
    const resumeExec = vi.fn(async ({ toolUseId }: { toolUseId: string }) =>
      okExecutionFor(toolUseId, toolUseId === "tu_w" ? "file created" : "read result"),
    );
    const seenMessages: unknown[] = [];
    const resumeTurn = vi.fn(async (messages: unknown[]) => {
      seenMessages.push(...messages.slice(-1));
      return turn({ text: "Done, the draft is filed.", inputTokens: 7, outputTokens: 3 });
    });

    const outcome = await resumeAgentLoop({
      deps: baseDeps({
        writes: "pause",
        routingMap: PAUSE_ROUTING,
        accessByName: PAUSE_ACCESS,
        modelTurn: resumeTurn,
        toolExec: resumeExec,
      }),
      pauseState: paused.pauseState,
      pendingWrite: paused.pendingWrite,
      decision: "approve",
    });

    expect(outcome.status).toBe("completed");
    // The write executed exactly once, with the agent's full chosen input, then
    // the post-write read ran — nothing else.
    expect(resumeExec).toHaveBeenCalledTimes(2);
    expect(resumeExec.mock.calls[0][0]).toMatchObject({
      toolUseId: "tu_w",
      route: WRITE_ROUTE,
      toolInput: { name: "draft.md" },
    });
    expect(resumeExec.mock.calls[1][0]).toMatchObject({ toolUseId: "tu_r2" });

    // The model's resume turn received ALL THREE results for the paused turn.
    const lastUser = seenMessages[0] as { role: string; content: Array<{ tool_use_id: string }> };
    expect(lastUser.role).toBe("user");
    expect(lastUser.content.map((r) => r.tool_use_id)).toEqual([
      "tu_r1",
      "tu_w",
      "tu_r2",
    ]);

    // Output, usage, and the tool-call trace SURVIVE the pause: text accumulates
    // across it, tokens sum, and the write settles to done.
    expect(outcome.output).toBe("Working. Done, the draft is filed.");
    expect(outcome.usage.tokensIn).toBe(17);
    expect(outcome.usage.tokensOut).toBe(8);
    expect(outcome.toolCalls.map((c) => [c.id, c.status])).toEqual([
      ["tu_r1", "done"],
      ["tu_w", "done"],
      ["tu_r2", "done"],
    ]);
  });

  it("resume DENY feeds a graceful declined result and the agent finishes (Fork 1)", async () => {
    const pauseCalls = [
      turnBlocks("Drafting. ", [
        { id: "tu_w", name: "gdrive__create_file", input: { name: "draft.md" } },
      ]),
    ];
    let i = 0;
    const paused = expectPaused(
      await runAgentLoop(
        baseDeps({
          writes: "pause",
          routingMap: PAUSE_ROUTING,
          accessByName: PAUSE_ACCESS,
          modelTurn: async () => pauseCalls[i++],
          toolExec: vi.fn(),
        }),
      ),
    );

    const resumeExec = vi.fn();
    let declinedResultContent = "";
    const outcome = await resumeAgentLoop({
      deps: baseDeps({
        writes: "pause",
        routingMap: PAUSE_ROUTING,
        accessByName: PAUSE_ACCESS,
        modelTurn: async (messages) => {
          const last = messages[messages.length - 1] as {
            content: Array<{ tool_use_id: string; content: string }>;
          };
          declinedResultContent = last.content[0]?.content ?? "";
          return turn({ text: "Understood — I prepared the draft but you declined filing it." });
        },
        toolExec: resumeExec,
      }),
      pauseState: paused.pauseState,
      pendingWrite: paused.pendingWrite,
      decision: "deny",
    });

    // Nothing executed; the agent saw the shared graceful decline and finished
    // normally — a COMPLETED outcome, not an error or cancellation.
    expect(resumeExec).not.toHaveBeenCalled();
    expect(declinedResultContent).toContain("declined");
    expect(declinedResultContent).toContain("do not retry");
    expect(outcome.status).toBe("completed");
    expect(outcome.output).toContain("declined filing");
    expect(outcome.toolCalls[0]).toMatchObject({ id: "tu_w", status: "denied" });
  });

  it("multi-write: a resume that reaches ANOTHER write pauses again", async () => {
    // Turn 1 proposes write A; after approval the model proposes write B.
    const turns: ModelTurnResult[] = [
      turnBlocks("First. ", [
        { id: "tu_a", name: "gdrive__create_file", input: { name: "a.md" } },
      ]),
      turnBlocks("Second. ", [
        { id: "tu_b", name: "gdrive__create_file", input: { name: "b.md" } },
      ]),
      turnBlocks("All filed.", []),
    ];
    let i = 0;
    const exec = vi.fn(async ({ toolUseId }: { toolUseId: string }) =>
      okExecutionFor(toolUseId, "created"),
    );
    const deps = baseDeps({
      writes: "pause",
      routingMap: PAUSE_ROUTING,
      accessByName: PAUSE_ACCESS,
      modelTurn: async () => turns[i++],
      toolExec: exec,
    });

    const firstPause = expectPaused(await runAgentLoop(deps));
    expect(firstPause.pendingWrite.toolUseId).toBe("tu_a");

    const secondPause = expectPaused(
      await resumeAgentLoop({
        deps,
        pauseState: firstPause.pauseState,
        pendingWrite: firstPause.pendingWrite,
        decision: "approve",
      }),
    );
    expect(secondPause.pendingWrite.toolUseId).toBe("tu_b");
    // Write A executed exactly once across the whole sequence so far.
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][0]).toMatchObject({ toolUseId: "tu_a" });

    const final = await resumeAgentLoop({
      deps,
      pauseState: secondPause.pauseState,
      pendingWrite: secondPause.pendingWrite,
      decision: "approve",
    });
    expect(final.status).toBe("completed");
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[1][0]).toMatchObject({ toolUseId: "tu_b" });
    // The full trace survived both pauses: A done, B done.
    expect(final.toolCalls.map((c) => [c.id, c.status])).toEqual([
      ["tu_a", "done"],
      ["tu_b", "done"],
    ]);
    expect(final.output).toBe("First. Second. All filed.");
  });

  it("the DEFAULT policy still refuses a write even when one is offered", async () => {
    // Same write turn, but writes unset (default "refuse"): the loop must hold
    // the call as not-performed and continue — byte-identical to pre-D1.
    const calls: ModelTurnResult[] = [
      turnBlocks("Trying. ", [
        { id: "tu_w", name: "gdrive__create_file", input: { name: "x" } },
      ]),
      turnBlocks("Acknowledged.", []),
    ];
    let i = 0;
    const toolExec = vi.fn();

    const outcome = await runAgentLoop(
      baseDeps({
        routingMap: PAUSE_ROUTING,
        accessByName: PAUSE_ACCESS,
        modelTurn: async () => calls[i++],
        toolExec,
      }),
    );

    expect(outcome.status).toBe("completed");
    expect(toolExec).not.toHaveBeenCalled();
    expect(outcome.toolCalls[0]).toMatchObject({
      id: "tu_w",
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
      const gated = await resolveGatedOrgMcpTools("test-org");
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
