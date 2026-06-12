import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  streamChatTurn,
  type LoopState,
} from "@/lib/chat/assistant-stream";
import type { PendingMcpToolCall } from "@/lib/chat/mcp-confirmation";
import { resolveOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import {
  classifyMcpTool,
  type McpToolAccess,
} from "@/lib/connections/mcp/tool-classification";
import { getVisibleCollections } from "@/lib/knowledge/collections-data";
import { buildResearchToolDef } from "@/lib/knowledge/research/inline";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Interactive MCP write-confirmation — the decision endpoint (Phase 2, 2P-7b-i).
 *
 * When the agentic loop hits a WRITE tool it pauses and persists a resumable run
 * (see lib/chat/assistant-stream.ts + the mcp_paused_runs migration). This route
 * records the owner's Approve / Deny decision and RESUMES the loop in this fresh
 * request, streaming the continuation as SSE into the same assistant message —
 * reusing the exact same streaming machinery as /api/chat.
 *
 * Auth: only the conversation owner can decide. RLS scopes the read/claim to the
 * owner's own paused run; an explicit user_id check is defense in depth. This is
 * a user-in-chat action (the person clicking Approve/Deny in their own
 * conversation), NOT an action taken on instructions from tool content.
 *
 * 2P-7b-i scope: DENY is fully wired (resume with a declined tool_result). APPROVE
 * is recorded and resumed with a placeholder result — the write itself does NOT
 * execute yet (that is 2P-7b-ii), so the v1 no-write guarantee is preserved.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const confirmSchema = z.object({
  paused_run_id: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
});

type ConfirmErrorCode =
  | "unauthenticated"
  | "invalid_input"
  | "not_found"
  | "already_decided"
  | "internal_error";

function errorResponse(error: ConfirmErrorCode, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return errorResponse("unauthenticated", 401);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse("invalid_input", 400);
    }
    const parsed = confirmSchema.safeParse(rawBody);
    if (!parsed.success) return errorResponse("invalid_input", 400);
    const { paused_run_id, decision } = parsed.data;

    // ---- Load the paused run (RLS scopes to the owner's own runs).
    const { data: run, error: runErr } = await supabase
      .from("mcp_paused_runs")
      .select(
        "id, conversation_id, message_id, user_id, organization_id, status, loop_state, pending_tool_call",
      )
      .eq("id", paused_run_id)
      .maybeSingle();
    if (runErr) {
      console.error("mcp_paused_runs fetch failed", { code: runErr.code });
      return errorResponse("internal_error", 500);
    }
    if (!run) return errorResponse("not_found", 404);
    // Defense in depth: RLS already restricts the read to the owner.
    if (run.user_id !== user.id) return errorResponse("not_found", 404);
    if (run.status !== "pending") return errorResponse("already_decided", 409);

    // ---- Atomically record the decision + claim the run (pending → resuming),
    // so a double-click or a retry can't resume the same run twice.
    const { data: claimed, error: claimErr } = await supabase
      .from("mcp_paused_runs")
      .update({
        status: "resuming",
        decision: { choice: decision, decided_at: new Date().toISOString() },
      })
      .eq("id", run.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimErr) {
      console.error("mcp_paused_runs claim failed", { code: claimErr.code });
      return errorResponse("internal_error", 500);
    }
    if (!claimed) return errorResponse("already_decided", 409);

    const seed = run.loop_state as unknown as LoopState;
    // The pending write to execute on approve (2P-7b-ii). Carries the route
    // (incl. token_ref pointer, never a token) + the tool input.
    const pending = run.pending_tool_call as unknown as PendingMcpToolCall;

    // ---- Re-resolve the org's MCP tools fresh for the continued loop (same as
    // a normal turn). On approve the pending write executes via its OWN persisted
    // route (above); this resolution covers any remaining reads and further tool
    // calls the continuation makes. A server disconnected since the pause simply
    // yields no tools — the loop still completes with a final text answer.
    const resolved = await resolveOrgMcpTools(run.organization_id);
    const mcpAccessByName = new Map<string, McpToolAccess>();
    const targetsByServerId = new Map(
      resolved.targets.map((t) => [t.serverId, t]),
    );
    for (const [namespaced, route] of Object.entries(resolved.routingMap)) {
      const descriptor = targetsByServerId
        .get(route.serverId)
        ?.tools?.find((tool) => tool.name === route.originalToolName);
      mcpAccessByName.set(
        namespaced,
        descriptor ? classifyMcpTool(descriptor) : "write",
      );
    }

    // ---- The native research tool, rebuilt for the resumed loop exactly as
    // the fresh path builds it (the loop is engaged here by definition):
    // visibility through the SAME RLS read the Research surface uses, under
    // the resuming owner's session.
    const visibleCollections = await getVisibleCollections();
    const researchTool = buildResearchToolDef(
      visibleCollections.map((c) => ({
        name: c.name,
        documentCount: c.presentCount,
      })),
    );

    // ---- Resume the loop, streaming the continuation into the same assistant
    // message. Model/agent/system context comes from the persisted loop state.
    return streamChatTurn({
      supabase,
      conversationId: run.conversation_id,
      organizationId: run.organization_id,
      agentId: seed.agentId,
      userId: user.id,
      modelSnapshot: seed.modelSnapshot,
      vendor: seed.vendor,
      vendorModelName: seed.vendorModelName,
      systemBlocks: seed.systemBlocks,
      tools: seed.tools,
      mcpToolDefs: resolved.toolDefs,
      mcpRoutingMap: resolved.routingMap,
      mcpAccessByName,
      mcpLoopEngaged: true,
      researchTool,
      mode: {
        kind: "resume",
        assistantMessageId: run.message_id,
        pausedRunId: run.id,
        decision,
        seed,
        pending,
      },
    });
  } catch (err) {
    console.error("/api/chat/confirm unexpected error", err);
    return errorResponse("internal_error", 500);
  }
}
