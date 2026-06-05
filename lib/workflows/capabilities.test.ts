import { describe, expect, it } from "vitest";

import type { OrgMcpExecutionTarget } from "@/lib/connections/mcp/connection-state";
import { mcpTargetsToToolOptions } from "./capabilities";
import { validateWorkflowDefinition } from "./validate";
import type { WorkflowStep } from "./types";

/** Fake governed targets: a Drive server (one read tool, one write tool) + a catalog-less server. */
const TARGETS = [
  {
    serverId: "google-drive-mcp",
    connectionId: "c1",
    tokenRef: "t1",
    serverUrl: "https://drive.test/mcp",
    trustTier: "first_party",
    tools: [
      {
        name: "search_files",
        description: "Search Drive",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string", description: "the query" } },
          required: ["query"],
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: "create_file",
        description: "Create a file",
        inputSchema: { type: "object", properties: { name: { type: "string" } } },
        annotations: {},
      },
    ],
  },
  {
    serverId: "self-hosted:https://acme.test",
    connectionId: "c2",
    tokenRef: "t2",
    serverUrl: "https://acme.test/mcp",
    trustTier: "untrusted",
    tools: null, // catalog not discovered → contributes nothing
  },
] as unknown as OrgMcpExecutionTarget[];

describe("mcpTargetsToToolOptions (governed capability resolution)", () => {
  it("maps only governed, catalogued tools with friendly labels + read/write classification", () => {
    const options = mcpTargetsToToolOptions(TARGETS);
    // The catalog-less server contributes nothing.
    expect(options).toHaveLength(2);

    const read = options.find((o) => o.toolName === "search_files");
    expect(read).toMatchObject({
      serverId: "google-drive-mcp",
      serverLabel: "Google Drive",
      fullLabel: "Google Drive: search files",
      access: "read",
    });
    expect(read?.args).toEqual([
      { name: "query", type: "string", required: true, description: "the query" },
    ]);

    const write = options.find((o) => o.toolName === "create_file");
    expect(write?.access).toBe("write"); // surfaces, but marked requires-approval in the UI
  });
});

describe("a builder-produced definition validates against the engine validator", () => {
  // What the builder emits: canonical steps with stable ids + input mappings.
  const builderOutput: WorkflowStep[] = [
    { id: "s1", type: "agent", name: "Draft", agentId: "agent-1" },
    {
      id: "s2",
      type: "tool_action",
      name: "Look up files",
      serverId: "google-drive-mcp",
      toolName: "search_files",
      argMapping: { query: { source: "step", stepId: "s1" } },
    },
    { id: "s3", type: "human_checkpoint", name: "Approve", prompt: "Send it?" },
  ];

  it("passes when its agents + tools resolve (the same gate the engine applies)", async () => {
    const result = await validateWorkflowDefinition(
      { steps: builderOutput },
      {
        isAgentRunnable: async (id) => id === "agent-1",
        classifyTool: async (serverId, toolName) =>
          serverId === "google-drive-mcp" && toolName === "search_files" ? "read" : null,
      },
    );
    expect(result.ok).toBe(true);
  });
});
