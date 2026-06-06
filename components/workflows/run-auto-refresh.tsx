"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Light "live-ish" refresh for an in-flight run view (Workflows arc, Step 4b).
 *
 * A workflow run executes server-side inside the start/decide actions and
 * persists its state, so the run view renders persisted truth — there is no
 * stream to subscribe to. This island re-fetches the server component tree on
 * a quiet interval while the run is non-terminal (running / awaiting
 * approval), so a viewer sees steps land and approvals settle without a manual
 * reload. The page mounts it only for non-terminal runs; a finished run is
 * static and polls nothing. Visibility-gated so background tabs stay quiet.
 */
export function RunAutoRefresh({ intervalMs = 7000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
