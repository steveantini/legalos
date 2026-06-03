import type { McpToolDescriptor } from "@/lib/connections/providers/types";

/**
 * MCP tool read/write classification (Phase 2, 2P-4) — a pure classifier for the
 * locked v1 safety policy (D-100): auto-run READ tools, BLOCK WRITE tools.
 *
 * THE LOCKED RULE (conservative by construction):
 *
 *   READ  iff the server AFFIRMATIVELY flags the tool read-only AND not
 *         destructive  →  annotations.readOnlyHint === true
 *                         AND annotations.destructiveHint !== true
 *
 *   WRITE in every other case — readOnlyHint absent or false, destructiveHint
 *         true, annotations entirely absent (the "unknown" state, e.g. catalogs
 *         discovered before 2P-4 or servers that don't annotate), or any ambiguity.
 *
 * So a tool is auto-run-eligible (read) ONLY when explicitly marked safe; a server
 * that doesn't annotate gets ALL its tools treated as writes. Annotations are
 * HINTS, not guarantees, which is exactly why "unknown" must mean write: we never
 * auto-run an action in a user's Gmail/Drive/Calendar on an absent or ambiguous
 * signal. Enforcement (run reads, hold writes) is 2P-6; this module only classifies.
 *
 * Pure and deterministic: no I/O, no model call, no route reference. Nothing wired
 * into the chat route. Builds under the D-100 lock.
 */

export type McpToolAccess = "read" | "write";

/**
 * Classify a tool as 'read' (auto-run-eligible) or 'write' (blocked in v1). Read
 * only when affirmatively read-only and non-destructive; write in all other cases,
 * including absent annotations.
 */
export function classifyMcpTool(descriptor: McpToolDescriptor): McpToolAccess {
  const annotations = descriptor.annotations;
  const affirmativelyReadOnly = annotations?.readOnlyHint === true;
  const destructive = annotations?.destructiveHint === true;
  return affirmativelyReadOnly && !destructive ? "read" : "write";
}

/** Convenience predicate: true when the tool is auto-run-eligible (read). */
export function isReadOnlyMcpTool(descriptor: McpToolDescriptor): boolean {
  return classifyMcpTool(descriptor) === "read";
}

/**
 * Partition tools into read vs write by name. Pure helper shaped for 2P-6 (which
 * will run the read set and hold the write set); NOT wired into the route here.
 * Keyed by tool name as the descriptors carry it; the caller maps to namespaced
 * names via 2P-2 where needed.
 */
export function partitionMcpToolsByAccess(descriptors: McpToolDescriptor[]): {
  read: McpToolDescriptor[];
  write: McpToolDescriptor[];
} {
  const read: McpToolDescriptor[] = [];
  const write: McpToolDescriptor[] = [];
  for (const descriptor of descriptors) {
    (classifyMcpTool(descriptor) === "read" ? read : write).push(descriptor);
  }
  return { read, write };
}
