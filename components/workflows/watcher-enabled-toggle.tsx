"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setWatcherEnabled } from "@/lib/actions/workflows";

/**
 * Pause / resume a watcher (Stage 3a, D-224). A paused watcher's schedule is
 * never selected by the cron's due-query, so it simply stops firing; resuming
 * lets the next tick pick it up. Admin-gated server-side (the action re-checks;
 * RLS re-enforces) — this control only renders for admins.
 */
export function WatcherEnabledToggle({
  scheduleId,
  enabled,
  watcherName,
}: {
  scheduleId: string;
  enabled: boolean;
  watcherName: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function toggle() {
    if (busy) return;
    setBusy(true);
    startTransition(async () => {
      const res = await setWatcherEnabled(scheduleId, !enabled);
      if (res.ok) {
        toast.success(enabled ? "Watcher paused." : "Watcher resumed.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
      setBusy(false);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={busy}
      aria-label={`${enabled ? "Pause" : "Resume"} the ${watcherName} watcher`}
    >
      {busy ? "Saving…" : enabled ? "Pause" : "Resume"}
    </Button>
  );
}
