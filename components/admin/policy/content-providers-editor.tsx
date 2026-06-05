"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { setVendorContentEnabledAction } from "@/lib/actions/content-providers";

/** A vendor content provider as the editor presents it. */
export type ContentProviderRow = {
  providerId: string;
  displayLabel: string;
  description: string;
  /** Whether the org currently shows this provider's curated agents. */
  enabled: boolean;
  /** ISO timestamp of the last platform-owner refresh, or null if never. */
  lastRefreshedAt: string | null;
};

/** Calm relative "updated …" line. Absolute date once it's older than ~a month. */
function formatUpdated(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "updated recently";
  const diffMs = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "updated just now";
  if (diffMs < hour) {
    const n = Math.floor(diffMs / minute);
    return `updated ${n} minute${n === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const n = Math.floor(diffMs / hour);
    return `updated ${n} hour${n === 1 ? "" : "s"} ago`;
  }
  if (diffMs < 30 * day) {
    const n = Math.floor(diffMs / day);
    return `updated ${n} day${n === 1 ? "" : "s"} ago`;
  }
  return `updated ${new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

/**
 * The admin Policy & access "Content" section (C4L/platform arc Step 5). The
 * org-level half of the two-layer governance: the platform owner owns the
 * content; the super admin owns whether the org SHOWS it. A list of vendor
 * content providers (Claude for Legal today; the list grows as a registry edit,
 * not a redesign), each with a name, a short description, a passive "last
 * updated" line (written by the platform-owner refresh — informational only, no
 * action), and an on/off control.
 *
 * Super admins (`canEdit`) get the Switch; other admins see the same state read
 * only ("Shown" / "Hidden"). Editing mirrors the established admin idiom
 * (PolicyEditor): optimistic flip in a transition, revert + `toast.error` on
 * failure, a quiet `toast.success` on save.
 */
export function ContentProvidersEditor({
  providers,
  canEdit,
}: {
  providers: ContentProviderRow[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [enabledById, setEnabledById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(providers.map((p) => [p.providerId, p.enabled])),
  );

  function toggle(providerId: string) {
    if (!canEdit || pending) return;
    const prev = enabledById[providerId];
    const next = !prev;
    setEnabledById((s) => ({ ...s, [providerId]: next }));
    startTransition(async () => {
      const result = await setVendorContentEnabledAction(providerId, next);
      if (!result.ok) {
        setEnabledById((s) => ({ ...s, [providerId]: prev }));
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Content library enabled." : "Content library hidden.");
    });
  }

  return (
    <section aria-labelledby="policy-content" className="mt-12">
      <h2
        id="policy-content"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        Content
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        Curated agent libraries legalOS ships into your departments. Turn one off
        to hide its agents for everyone in your organization.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-hairline">
        {providers.map((provider) => {
          const enabled = enabledById[provider.providerId];
          return (
            <div
              key={provider.providerId}
              className="flex items-center gap-4 border-b border-hairline bg-paper-2 px-4 py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-foreground">
                  {provider.displayLabel}
                </p>
                <p className="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground">
                  {provider.description}
                </p>
                {provider.lastRefreshedAt ? (
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-caption">
                    {formatUpdated(provider.lastRefreshedAt)}
                  </p>
                ) : null}
              </div>
              <div className="ml-auto shrink-0">
                {canEdit ? (
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => toggle(provider.providerId)}
                    disabled={pending}
                    aria-label={`Show ${provider.displayLabel} content`}
                  />
                ) : (
                  <span
                    className={`text-[12px] font-medium ${
                      enabled ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {enabled ? "Shown" : "Hidden"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!canEdit ? (
        <p className="mt-3 text-[13px] leading-[1.5] text-caption">
          Only super admins can change the content library. You’re viewing it as
          read only.
        </p>
      ) : null}
    </section>
  );
}
