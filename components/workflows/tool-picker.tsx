"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { ToolOption } from "@/lib/workflows/capabilities";
import {
  groupToolOptionsByServer,
  type ToolPickerGroup,
  type ToolPickerItem,
} from "@/lib/workflows/tool-picker-options";

/**
 * The builder's searchable tool picker (Workflow arc polish): a select-like
 * trigger that opens a filterable list of the org's governed MCP tools,
 * grouped by server and labeled with the SAME friendly names the chat
 * tool-trace uses ("Gmail: create draft"). Typing narrows on the friendly
 * label; write tools carry a quiet "Requires approval" tag. Built on Base UI's
 * Combobox (keyboard + screen-reader behavior handled by the primitive),
 * visually matched to the app's Select.
 *
 * The stored value is unchanged: the canonical `serverId::toolName` key the
 * step keeps. Items are `{ value, label }` objects, so Base UI filters on the
 * friendly label automatically; equality is by the stored key.
 */
export function ToolPicker({
  tools,
  value,
  onValueChange,
}: {
  tools: ToolOption[];
  /** The selected composite key (`serverId::toolName`), or "" when unset. */
  value: string;
  onValueChange: (key: string) => void;
}) {
  const groups = useMemo(() => groupToolOptionsByServer(tools), [tools]);

  // The controlled value as a picker item. A selected tool that is no longer
  // connected/governed reads honestly as unavailable; the builder renders its
  // explanatory note below the control.
  const selectedItem = useMemo<ToolPickerItem | null>(() => {
    if (!value) return null;
    for (const group of groups) {
      const match = group.items.find((item) => item.value === value);
      if (match) return match;
    }
    return { value, label: "Unavailable tool", access: "read" };
  }, [groups, value]);

  return (
    <Combobox.Root
      items={groups}
      value={selectedItem}
      onValueChange={(next: ToolPickerItem | null) => {
        if (next) onValueChange(next.value);
      }}
      isItemEqualToValue={(a: ToolPickerItem, b: ToolPickerItem) =>
        a?.value === b?.value
      }
    >
      <Combobox.Trigger
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-paper-2 py-2 pr-2 pl-2.5 text-left text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Tool"
      >
        <span
          className={cn("line-clamp-1 flex-1", !selectedItem && "text-muted-foreground")}
        >
          {selectedItem ? selectedItem.label : "Choose a connected tool"}
        </span>
        <ChevronDownIcon
          aria-hidden
          className="pointer-events-none size-4 shrink-0 text-muted-foreground"
        />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
              <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <Combobox.Input
                placeholder="Search tools…"
                className="h-5 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Combobox.Empty className="px-3 py-4 text-center text-[13px] text-muted-foreground empty:m-0 empty:p-0">
              No tools found.
            </Combobox.Empty>
            <Combobox.List className="max-h-72 overflow-y-auto p-1">
              {(group: ToolPickerGroup) => (
                <Combobox.Group key={group.server} items={group.items}>
                  <Combobox.GroupLabel className="px-1.5 py-1 text-xs text-muted-foreground">
                    {group.server}
                  </Combobox.GroupLabel>
                  <Combobox.Collection>
                    {(item: ToolPickerItem) => (
                      <Combobox.Item
                        key={item.value}
                        value={item}
                        className="relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      >
                        <span className="flex-1">{item.label}</span>
                        {item.access === "write" ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            Requires approval
                          </span>
                        ) : null}
                        <Combobox.ItemIndicator
                          render={
                            <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
                          }
                        >
                          <CheckIcon className="pointer-events-none size-4" />
                        </Combobox.ItemIndicator>
                      </Combobox.Item>
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
