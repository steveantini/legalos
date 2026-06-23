"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserProfile, requireAuthUser } from "@/lib/auth/access";
import {
  normalizeFeedUrl,
  UnsafeFeedUrlError,
} from "@/lib/workspace/home/feed-fetch";
import { resolveFeed } from "@/lib/workspace/home/desk-feeds";
import { FEED_CAP, FEED_TTL_MS, isFeedStale } from "@/lib/workspace/home/desk-feeds-shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for personal Desk feeds (Desk feeds v1). Add a content source
 * by URL, remove one, and refresh the cached latest item on a TTL. All writes
 * go through the RLS server client, so the desk_feeds owner policy is the
 * security boundary; the checks here (cap, dedupe, URL safety) are UX and
 * defense in depth on top of it.
 *
 * The add action fetches the feed once, synchronously, so a just-added card
 * shows its latest item immediately. The refresh action re-fetches only feeds
 * whose cache has aged past the TTL, so reloading the home renders from cache.
 */

const WORKSPACE_HOME = "/workspace";
const GENERIC_ERROR = "Something went wrong. Please try again.";

type ActionResult = { ok: true } | { ok: false; error: string };

const addSchema = z.object({
  url: z.string().trim().min(1, "Paste a feed URL.").max(2048),
});

/** Add a content source by URL, then resolve its latest item into the cache. */
export async function addDeskFeed(input: { url: string }): Promise<ActionResult> {
  const user = await requireAuthUser();
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the URL." };
  }

  let feedUrl: string;
  try {
    feedUrl = normalizeFeedUrl(parsed.data.url);
  } catch (err) {
    const message =
      err instanceof UnsafeFeedUrlError
        ? err.message
        : "That doesn't look like a valid feed URL.";
    return { ok: false, error: message };
  }

  const supabase = await createSupabaseServerClient();

  // Cap (per-user) and dedupe, read under the owner's RLS view.
  const { data: existing, error: readError } = await supabase
    .from("desk_feeds")
    .select("id, feed_url, sort_order")
    .eq("user_id", user.id);
  if (readError) return { ok: false, error: GENERIC_ERROR };

  const rows = existing ?? [];
  if (rows.length >= FEED_CAP) {
    return {
      ok: false,
      error: `You can keep up to ${FEED_CAP} feeds on your Desk. Remove one to add another.`,
    };
  }
  if (rows.some((r) => r.feed_url === feedUrl)) {
    return { ok: false, error: "That feed is already on your Desk." };
  }

  const nextOrder =
    rows.reduce((max, r) => Math.max(max, r.sort_order ?? 0), 0) + 1;

  // Insert the source first (status 'pending'), so even if the fetch fails the
  // row exists and the card shows its honest failure state.
  const { data: inserted, error: insertError } = await supabase
    .from("desk_feeds")
    .insert({
      user_id: user.id,
      organization_id: profile.organization_id,
      feed_url: feedUrl,
      title: "",
      sort_order: nextOrder,
      fetch_status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    // A racing duplicate trips the unique index — report it as the dedupe case.
    if ((insertError as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "That feed is already on your Desk." };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  // Resolve the latest item and write the cache. resolveFeed never throws; a
  // failed fetch yields a status:'error' update.
  const update = await resolveFeed(feedUrl);
  const { title, ...cache } = update;
  await supabase
    .from("desk_feeds")
    .update({
      ...cache,
      // Only adopt a resolved title; never blank a row the user may rename.
      ...(title && title.length > 0 ? { title } : {}),
      last_fetched_at: new Date().toISOString(),
    })
    .eq("id", inserted.id)
    .eq("user_id", user.id);

  revalidatePath(WORKSPACE_HOME);
  return { ok: true };
}

const removeSchema = z.object({ id: z.string().uuid() });

/** Remove a feed from the user's Desk. RLS scopes the delete to the owner. */
export async function removeDeskFeed(input: { id: string }): Promise<ActionResult> {
  const user = await requireAuthUser();
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("desk_feeds")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: GENERIC_ERROR };

  revalidatePath(WORKSPACE_HOME);
  return { ok: true };
}

/**
 * Refresh the cached latest item for the user's feeds whose cache has aged past
 * the TTL (or never resolved). Called by the Desk on mount; a no-op when every
 * feed is fresh. Each feed resolves independently, so one failing feed never
 * stops the others.
 */
export async function refreshDeskFeeds(): Promise<ActionResult> {
  const user = await requireAuthUser();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("desk_feeds")
    .select("id, feed_url, last_fetched_at")
    .eq("user_id", user.id);
  if (error || !data) return { ok: false, error: GENERIC_ERROR };

  const now = Date.now();
  const stale = data.filter((r) => isFeedStale(r.last_fetched_at, now, FEED_TTL_MS));
  if (stale.length === 0) return { ok: true };

  await Promise.allSettled(
    stale.map(async (row) => {
      const update = await resolveFeed(row.feed_url);
      const { title, ...cache } = update;
      await supabase
        .from("desk_feeds")
        .update({
          ...cache,
          ...(title && title.length > 0 ? { title } : {}),
          last_fetched_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("user_id", user.id);
    }),
  );

  revalidatePath(WORKSPACE_HOME);
  return { ok: true };
}
