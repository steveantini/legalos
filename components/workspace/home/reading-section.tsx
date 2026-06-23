import { deskClockMs, getDeskFeeds } from "@/lib/workspace/home/desk-feeds";

import { DeskFeedsView } from "./desk-feeds-view";

/**
 * "Desk" — the bottom section of the workspace home, now the home of personal
 * content feeds (Desk feeds v1). The user adds Substacks, podcasts, and news
 * sources by URL; each renders as a card with its latest post, linking out.
 *
 * Server component: it reads the user's feeds (owner-scoped by RLS) from their
 * cached latest-item columns and hands them to the client `DeskFeedsView`, which
 * renders the cards immediately and refreshes any stale feed on mount. The cache
 * is populated server-side on add and on a TTL refresh, never on this render, so
 * the section paints fast from cache like the rest of the home.
 *
 * The empty state lives in DeskFeedsView (an inviting "add your first feed"),
 * replacing the old admin-curated placeholder. The future admin-curated,
 * role-scoped layer is architected for as a sibling source the loader will merge
 * in (see desk-feeds-shared.ts and migration 0075); it is not built here.
 */
export async function ReadingSection({ userId }: { userId: string }) {
  const feeds = await getDeskFeeds(userId);
  // Capture the render-time clock once (in a plain helper, off the render path)
  // and pass it down, so the client renders relative dates from a stable value:
  // pure on the client and identical across hydration.
  const nowMs = deskClockMs();
  return <DeskFeedsView feeds={feeds} nowMs={nowMs} />;
}
