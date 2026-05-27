import type { ReactNode } from "react";

/**
 * Page header for a department launchpad — the same h1+subline shape the
 * workspace home greeting (`HomeGreeting`) and the Stage 1 group landings
 * use, minus the bolded-phrase parser the prior landing hero carried.
 *
 * Typography:
 *   - h1: Inter Tight 44px / 400 / -0.03em / 1.02 / max 22ch / ink
 *   - subline: 14.5px / 1.5 / max 56ch / mute
 *
 * Description is nullable in the schema; renders the h1 alone when null.
 *
 * Optional `action` slot (Session 21): an inline node rendered top-right
 * of the header — used by the launchpad page to host a "+ New Agent"
 * button alongside the title block. Mirrors the AgentHeader's Edit-link
 * pattern (`components/chat/agent-header.tsx:143-150`); same flex-row +
 * `items-start justify-between` layout. Omit the prop on pages that
 * don't need an action.
 */
export function DepartmentHeader({
  name,
  description,
  action,
}: {
  name: string;
  description: string | null;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          {name}
        </h1>
        {description ? (
          <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
