import type { ToolOption } from "@/lib/workflows/capabilities";

/**
 * Pure option-shaping for the builder's searchable tool picker (Workflow arc
 * polish). Lives outside the server-only capabilities module so the client
 * picker can import it, and outside the picker component so it is unit-
 * testable without a DOM.
 *
 * The picker stores the same composite key the builder always used
 * (`serverId::toolName`); only the presentation is friendly.
 */

/** One pickable tool: the stored composite key plus its friendly label. */
export type ToolPickerItem = {
  /** The stored composite key, `serverId::toolName`. */
  value: string;
  /** The friendly label the picker shows and filters on, e.g. "Gmail: create draft". */
  label: string;
  /** 'write' tools surface with a "Requires approval" tag (Step 3). */
  access: "read" | "write";
};

/** Tools of one server, grouped for the picker's section headers. */
export type ToolPickerGroup = {
  /** The friendly server name, e.g. "Google Drive". */
  server: string;
  items: ToolPickerItem[];
};

/** The composite key a tool_action step stores, from its parts. */
export function toolPickerKey(serverId: string, toolName: string): string {
  return `${serverId}::${toolName}`;
}

/**
 * Group the (already server-then-action sorted) tool options by server for the
 * searchable picker. Order is preserved exactly as capabilities resolved it.
 */
export function groupToolOptionsByServer(tools: ToolOption[]): ToolPickerGroup[] {
  const groups: ToolPickerGroup[] = [];
  for (const tool of tools) {
    const item: ToolPickerItem = {
      value: toolPickerKey(tool.serverId, tool.toolName),
      label: tool.fullLabel,
      access: tool.access,
    };
    const last = groups[groups.length - 1];
    if (last && last.server === tool.serverLabel) {
      last.items.push(item);
    } else {
      groups.push({ server: tool.serverLabel, items: [item] });
    }
  }
  return groups;
}
