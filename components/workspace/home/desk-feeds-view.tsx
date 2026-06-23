"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addDeskFeed,
  refreshDeskFeeds,
  removeDeskFeed,
} from "@/lib/actions/desk-feeds";
import {
  type DeskCard,
  FEED_CAP,
  formatDuration,
  isFeedStale,
  relativeDate,
} from "@/lib/workspace/home/desk-feeds-shared";
import { cn } from "@/lib/utils";

/**
 * The Desk's personal-feeds surface (Desk feeds v1). Renders one card per
 * content source the user added, each showing the source's latest item, and the
 * affordances to add and remove feeds. Cards render from the cache the server
 * passed in `feeds`, so the grid paints instantly; on mount this component asks
 * the server to refresh any feed whose cache has aged past the TTL, then pulls
 * the fresh cache with router.refresh().
 *
 * The add/remove transitions run HERE, in a component that stays mounted, not
 * inside the dialog that unmounts on close — a router.refresh() scheduled in an
 * unmounting transition is dropped (the b88a37f mounted-view lesson).
 */
export function DeskFeedsView({
  feeds,
  nowMs,
}: {
  feeds: DeskCard[];
  nowMs: number;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pendingAdd, startAdd] = useTransition();
  const [pendingRemove, startRemove] = useTransition();
  const refreshed = useRef(false);

  useEffect(() => {
    // Refresh stale/pending feeds once per mount, then re-read the cache. No
    // setState here: the only state change is the server re-render router.refresh
    // triggers, which flows back in as new `feeds`.
    if (refreshed.current) return;
    refreshed.current = true;
    const hasStale = feeds.some(
      (f) => f.status === "pending" || isFeedStale(f.lastFetchedAt, Date.now()),
    );
    if (!hasStale) return;
    void refreshDeskFeeds().then((result) => {
      if (result.ok) router.refresh();
    });
  }, [feeds, router]);

  function handleAdd() {
    if (pendingAdd) return;
    const trimmed = url.trim();
    if (trimmed.length === 0) return;
    startAdd(async () => {
      const result = await addDeskFeed({ url: trimmed });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Feed added to your Desk.");
      setUrl("");
      setAddOpen(false);
      router.refresh();
    });
  }

  function handleRemove(feed: DeskCard) {
    if (pendingRemove) return;
    startRemove(async () => {
      const result = await removeDeskFeed({ id: feed.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Removed ${feed.title}.`);
      router.refresh();
    });
  }

  const atCap = feeds.length >= FEED_CAP;

  return (
    <section
      aria-labelledby="reading-section-heading"
      className="flex flex-col gap-5"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="reading-section-heading"
          className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
        >
          Desk
        </h2>
        {feeds.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={atCap}
            aria-label="Add a feed"
          >
            <Plus />
            Add feed
          </Button>
        ) : null}
      </div>

      {feeds.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {feeds.map((feed) => (
            <FeedCardItem
              key={feed.id}
              feed={feed}
              nowMs={nowMs}
              onRemove={() => handleRemove(feed)}
            />
          ))}
        </ul>
      )}

      {atCap ? (
        <p className="text-[12px] text-caption">
          You’ve reached the {FEED_CAP}-feed limit. Remove one to add another.
        </p>
      ) : null}

      <AddFeedDialog
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) setUrl("");
        }}
        url={url}
        onUrlChange={setUrl}
        onSubmit={handleAdd}
        pending={pendingAdd}
      />
    </section>
  );
}

/** The inviting empty state: honest about personal feeds now and curation later. */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card p-12 text-center">
      <p className="mb-1.5 text-[17px] font-medium text-foreground">
        Build your reading desk
      </p>
      <p className="mx-auto mb-5 max-w-[56ch] text-[14px] leading-[1.55] text-muted-foreground">
        Add a Substack, a podcast, or a news source by URL and its latest post
        lands here as a card. Curated reading picked for your role may join your
        own feeds here later.
      </p>
      <Button onClick={onAdd}>
        <Plus />
        Add your first feed
      </Button>
    </div>
  );
}

/** One feed card: logo, publication, latest item, date (and podcast duration). */
function FeedCardItem({
  feed,
  nowMs,
  onRemove,
}: {
  feed: DeskCard;
  nowMs: number;
  onRemove: () => void;
}) {
  // Where the card clicks through to: the item, else the site, else the feed.
  const href = feed.item?.url ?? feed.siteUrl ?? feed.feedUrl;
  const date = relativeDate(feed.item?.publishedAt ?? null, nowMs);
  const duration = formatDuration(feed.item?.durationSeconds ?? null);

  return (
    <li className="group relative flex rounded-xl border border-border bg-card transition-colors hover:border-foreground/15">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={
          feed.item?.title
            ? `${feed.title}: ${feed.item.title}`
            : `Open ${feed.title}`
        }
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      <div className="pointer-events-none relative z-10 flex w-full items-start gap-3.5 p-4">
        <FeedLogo title={feed.title} imageUrl={feed.item?.imageUrl ?? null} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-caption">
            {feed.title}
          </p>

          {feed.status === "pending" ? (
            <PendingLines />
          ) : feed.status === "error" || !feed.item?.title ? (
            <p className="mt-1.5 text-[13px] leading-[1.45] text-muted-foreground">
              Couldn’t load this feed. We’ll try again shortly.
            </p>
          ) : (
            <>
              <p className="mt-1 line-clamp-2 text-[14px] font-medium leading-[1.4] text-foreground">
                {feed.item.title}
              </p>
              {date || duration ? (
                <p className="mt-1.5 text-[12px] text-caption">
                  {date}
                  {date && duration ? " · " : ""}
                  {duration}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${feed.title}`}
        className="absolute right-1.5 top-1.5 z-20 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

/** Square source logo with a monogram fallback when there's no image or it fails. */
function FeedLogo({ title, imageUrl }: { title: string; imageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const monogram = title.trim().charAt(0).toUpperCase() || "·";

  if (imageUrl && !failed) {
    // A plain <img> (not next/image) on purpose: the source host is arbitrary
    // user-supplied input, so it must not pass through the Next image optimizer
    // (its own server-side fetch) nor require remote-pattern allowlisting; the
    // no-referrer policy keeps the user's Desk from leaking to the source.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-border"
      />
    );
  }

  return (
    <div
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-[15px] font-semibold text-muted-foreground ring-1 ring-border"
    >
      {monogram}
    </div>
  );
}

/** Skeleton lines for a feed whose first fetch is still in flight. */
function PendingLines() {
  return (
    <div className="mt-1.5 space-y-1.5" aria-hidden>
      <div className="h-3.5 w-full animate-pulse rounded bg-hairline motion-reduce:animate-none" />
      <div className="h-3.5 w-2/3 animate-pulse rounded bg-hairline motion-reduce:animate-none" />
    </div>
  );
}

function AddFeedDialog({
  open,
  onOpenChange,
  url,
  onUrlChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a feed</DialogTitle>
          <DialogDescription>
            Paste the URL of a Substack, podcast, blog, or news feed. We’ll find
            its feed and show the latest post on your Desk.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <Input
            type="url"
            inputMode="url"
            autoFocus
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://www.lennysnewsletter.com/feed"
            aria-label="Feed URL"
            className={cn(pending && "opacity-60")}
            disabled={pending}
          />

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || url.trim().length === 0}>
              {pending ? "Adding…" : "Add feed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
