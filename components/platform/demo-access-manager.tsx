"use client";

import { Check, Copy } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  mintDemoLinkAction,
  revokeDemoLinkAction,
} from "@/lib/actions/demo-access";
import {
  DEMO_DEFAULT_WINDOW_DAYS,
  DEMO_LABEL_MAX_LENGTH,
  DEMO_WINDOW_OPTIONS,
  type DemoInvitationView,
  type DemoLinkDisplayStatus,
} from "@/lib/demo/admin";

/**
 * The platform demo-access surface (D-166): mint a labeled, time-window link
 * (the raw url shown once), see every link with its label / status / dates, and
 * revoke an active one. The mint and revoke transitions live HERE, in the
 * always-mounted view, so their router.refresh() lands even when the revoke
 * dialog unmounts (the mounted-view transition lesson, b88a37f).
 */
export function DemoAccessManager({
  demoOrgReady,
  invitations,
}: {
  demoOrgReady: boolean;
  invitations: DemoInvitationView[];
}) {
  const router = useRouter();
  const [windowDays, setWindowDays] = useState(String(DEMO_DEFAULT_WINDOW_DAYS));
  const [label, setLabel] = useState("");
  const [minted, setMinted] = useState<{
    url: string;
    label: string | null;
    expiresAt: string;
  } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<DemoInvitationView | null>(
    null,
  );
  const [pendingMint, startMint] = useTransition();
  const [pendingRevoke, startRevoke] = useTransition();

  function onMint() {
    if (pendingMint) return;
    startMint(async () => {
      const result = await mintDemoLinkAction(Number(windowDays), label);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMinted({
        url: result.url,
        label: result.label,
        expiresAt: result.expiresAt,
      });
      setLabel("");
      router.refresh();
    });
  }

  function onConfirmRevoke() {
    if (pendingRevoke || !revokeTarget) return;
    const target = revokeTarget;
    startRevoke(async () => {
      const result = await revokeDemoLinkAction(target.id);
      setRevokeTarget(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Link revoked.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-12">
      {/* MINT */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-medium text-foreground">
            Mint a demo link
          </h2>
          <p className="mt-1 max-w-[60ch] text-[13px] leading-[1.5] text-muted-foreground">
            The link is shown once, here, right after you mint it. Only its hash
            is stored, so copy it now and share it over a trusted channel.
          </p>
        </div>

        {!demoOrgReady ? (
          <p className="rounded-lg border border-hairline bg-paper-2 px-4 py-3 text-[13px] leading-[1.5] text-muted-foreground">
            No Demo Org is set up yet (exactly one organization must have
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[12px]">
              is_demo = true
            </code>
            ). Seed the Demo Org, then mint here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex w-full max-w-[280px] flex-col gap-1.5">
                <Label htmlFor="demo-label">Label</Label>
                <Input
                  id="demo-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={DEMO_LABEL_MAX_LENGTH}
                  placeholder="Acme Corp – GC"
                  disabled={pendingMint}
                />
              </div>
              <div className="flex w-[140px] flex-col gap-1.5">
                <Label htmlFor="demo-window">Window</Label>
                <Select
                  value={windowDays}
                  onValueChange={(value) =>
                    setWindowDays(value ?? String(DEMO_DEFAULT_WINDOW_DAYS))
                  }
                  disabled={pendingMint}
                >
                  <SelectTrigger id="demo-window">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEMO_WINDOW_OPTIONS.map((days) => (
                      <SelectItem key={days} value={String(days)}>
                        {days} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={onMint} disabled={pendingMint}>
                {pendingMint ? "Minting…" : "Mint link"}
              </Button>
            </div>

            {minted ? (
              <MintedLinkReveal
                url={minted.url}
                label={minted.label}
                expiresAt={minted.expiresAt}
                onDismiss={() => setMinted(null)}
              />
            ) : null}
          </div>
        )}
      </section>

      {/* LIST */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-medium text-foreground">
            Demo links
          </h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
            Your record of who has demo access.
          </p>
        </div>

        {invitations.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-paper-2 px-4 py-6 text-center text-[13px] leading-[1.5] text-muted-foreground">
            No demo links yet. Mint one above to give a prospect access.
          </p>
        ) : (
          <ul className="flex flex-col">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center gap-4 border-b border-hairline py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-foreground">
                    {invitation.label ?? (
                      <span className="text-muted-foreground">
                        Unlabeled link
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-[1.4] text-caption">
                    Minted {formatDate(invitation.createdAt)} · Expires{" "}
                    {formatDate(invitation.expiresAt)} ·{" "}
                    {invitation.lastAccessedAt
                      ? `Last opened ${formatDate(invitation.lastAccessedAt)}`
                      : "Never opened"}
                  </p>
                </div>
                <StatusPill status={invitation.displayStatus} />
                <div className="w-[78px] shrink-0 text-right">
                  {invitation.displayStatus === "active" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeTarget(invitation)}
                      disabled={pendingRevoke}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* REVOKE CONFIRM */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this demo link?</DialogTitle>
            <DialogDescription>
              {revokeTarget?.label ? (
                <>
                  <strong>{revokeTarget.label}</strong>{" "}
                  will stop working immediately.
                </>
              ) : (
                "This link will stop working immediately."
              )}{" "}
              Anyone already in a demo session keeps it until it ends, but the
              link can no longer start a new one. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRevokeTarget(null)}
              disabled={pendingRevoke}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmRevoke}
              disabled={pendingRevoke}
            >
              {pendingRevoke ? "Revoking…" : "Revoke link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MintedLinkReveal({
  url,
  label,
  expiresAt,
  onDismiss,
}: {
  url: string;
  label: string | null;
  expiresAt: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] font-medium text-foreground">
          Link minted{label ? ` for ${label}` : ""}. Copy it now, it is shown
          only once.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Dismiss
        </button>
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2.5 py-2 font-mono text-[12.5px] text-foreground">
          {url}
        </code>
        <CopyLinkButton text={url} />
      </div>
      <p className="text-[12px] text-caption">
        Works repeatedly until it expires on {formatDate(expiresAt)}.
      </p>
    </div>
  );
}

function CopyLinkButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context or denied) — leave as "Copy".
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      aria-label={copied ? "Link copied" : "Copy link"}
      className="shrink-0"
    >
      {copied ? (
        <Check className="size-4" />
      ) : (
        <Copy className="size-4" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

const STATUS_STYLES: Record<
  DemoLinkDisplayStatus,
  { dot: string; label: string }
> = {
  active: { dot: "bg-emerald-500", label: "Active" },
  expired: { dot: "bg-muted-foreground/50", label: "Expired" },
  revoked: { dot: "bg-destructive/70", label: "Revoked" },
};

function StatusPill({ status }: { status: DemoLinkDisplayStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
