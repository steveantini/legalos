/**
 * Loading boundary for the agent surfaces (the `/agents/<id>` chat and its
 * `edit` route).
 *
 * Placed at the `agents/` segment, NOT at `agents/[id]/`, on purpose: this
 * one Suspense fallback wraps the whole agent subtree, so it covers BOTH the
 * agent layout's `getAgent` fetch (`agents/[id]/layout.tsx`) and the page's
 * data load in a single boundary. That is what keeps the generic workspace
 * card-grid skeleton (`app/workspace/loading.tsx`) from flashing on the way
 * to a chat surface: the nearest boundary to the suspending agent subtree is
 * this one, so the card grid never gets a turn. A boundary at `agents/[id]/`
 * would sit *below* the layout's fetch, letting the card grid show while the
 * layout resolves and then this skeleton show while the page resolves — two
 * swaps instead of one. One boundary here, one clean swap.
 *
 * Shape mirrors the chat surface's empty state — the layout a fresh agent-
 * card click lands on (no `?c=` conversation param): a centered column
 * pushed ~14vh down (matching ChatInterface's `pt-[14vh]`), an AgentHeader-
 * shaped card (name + description), and a MessageInput-shaped composer. The
 * frames render solid — they are the furniture that appears instantly; only
 * the content bars pulse, matching how the live surface reads while its text
 * loads. Honors `prefers-reduced-motion` via `motion-reduce:animate-none`.
 *
 * Like the sibling `app/workspace/loading.tsx`, this fills the workspace
 * layout body wrapper's `{children}` slot and inherits its `px-14 pt-14 pb-8`
 * padding, so it adds no outer padding of its own. `aria-hidden` keeps the
 * placeholder boxes out of the accessibility tree (decorative furniture);
 * Next.js's route announcer handles the navigation announcement.
 *
 * Note: the `edit` route lives under this boundary too, so it also shows the
 * chat-shaped placeholder rather than the card grid. That is a deliberate,
 * strictly-better trade-off (edit is reached rarely, almost always from
 * within an agent surface, and a chat-ish shape beats card outlines for it
 * as well); a dedicated edit skeleton can land later if it ever matters.
 */
export default function AgentLoading() {
  return (
    <main
      aria-hidden
      className="scrollbar-stable mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col pt-[14vh]">
        {/* Header card — mirrors AgentHeader's empty-state card
            (max-w-3xl, rounded-[10px], border-border-strong,
            bg-card-divider, p-4): an agent-name bar over a description bar. */}
        <div className="mx-auto mb-4 w-full max-w-3xl rounded-[10px] border border-border-strong bg-card-divider p-4">
          <div className="h-[28px] w-1/2 max-w-[280px] animate-pulse rounded-md bg-muted/50 motion-reduce:animate-none" />
          <div className="mt-3 h-[14px] w-[80%] max-w-[440px] animate-pulse rounded-md bg-muted/40 motion-reduce:animate-none" />
        </div>

        {/* Composer — mirrors MessageInput's frame (max-w-3xl wrapper,
            inner -ml-3 rounded-[14px] border-border-strong bg-card box with
            px-3 pt-3 pb-2). An input-line bar over a toolbar row (model chip
            on the left, send button on the right). */}
        <div className="mx-auto w-full max-w-3xl pt-3 pb-2">
          <div className="-ml-3 flex flex-col gap-4 rounded-[14px] border border-border-strong bg-card px-3 pt-3 pb-2">
            <div className="h-[20px] w-[55%] max-w-[320px] animate-pulse rounded-md bg-muted/40 motion-reduce:animate-none" />
            <div className="flex items-center justify-between">
              <div className="h-[24px] w-[120px] animate-pulse rounded-md bg-muted/30 motion-reduce:animate-none" />
              <div className="h-[28px] w-[28px] animate-pulse rounded-md bg-muted/30 motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
