"use client";

import { useState, useTransition } from "react";
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
  clearBYOModelKey,
  setBYOModelKey,
  switchToBYO,
  switchToManaged,
} from "@/lib/actions/model-connection";
import type { OrgModelConnectionState } from "@/lib/connections/model-connection-state";
import { cn } from "@/lib/utils";

/**
 * The model connection control (admin Policy & access, flag 1d) — the "agnostic
 * model connector," grouped with the Default model control as model governance.
 *
 * Two legible axes: WHICH PROVIDER (a provider-uniform grid — Anthropic available
 * now; Google, OpenAI, self-hosted coming soon) and, for the available provider,
 * WHOSE CREDENTIALS (managed legalOS models vs the organization's own key). Super
 * admins get the interactive Anthropic card; every other admin sees the current
 * state read only, mirroring the rest of this page (the org connection is
 * super-admin-read-only under RLS, so the page reads its state service-side).
 *
 * The key is write-only here: it is entered, validated against Anthropic BEFORE
 * storing (the delight + trust moment), then shown only as a masked hint and
 * never re-displayed or logged. Anthropic's endpoint is fixed, so no base-URL
 * field is shown (that surfaces for self-hosted later). Switching to managed is
 * non-destructive; removing the key is confirmed.
 */

const ANTHROPIC_VENDOR = "anthropic";

// The provider grid (axis 1). Provider-uniform: every provider is the same card
// shape; Anthropic is active, the rest are honest coming-soon, in roadmap order.
const COMING_SOON_PROVIDERS = [
  { name: "Google", description: "Gemini models." },
  { name: "OpenAI", description: "GPT models." },
  { name: "Self-hosted", description: "An OpenAI-compatible endpoint you run." },
] as const;

export function ModelConnectionEditor({
  anthropicState,
  canEdit,
}: {
  anthropicState: OrgModelConnectionState | null;
  canEdit: boolean;
}) {
  return (
    <section aria-labelledby="policy-model-connection" className="mt-12">
      <h2
        id="policy-model-connection"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        Model connection
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        Choose whether your agents run on legalOS managed models or your
        organization’s own model provider key.
      </p>

      <div className="mt-5 space-y-3">
        <AnthropicCard initialState={anthropicState} canEdit={canEdit} />

        <div className="grid gap-3 sm:grid-cols-3">
          {COMING_SOON_PROVIDERS.map((provider) => (
            <ComingSoonCard
              key={provider.name}
              name={provider.name}
              description={provider.description}
            />
          ))}
        </div>
      </div>

      {!canEdit ? (
        <p className="mt-4 text-[13px] leading-[1.5] text-caption">
          Only super admins can change the model connection. You’re viewing it as
          read only.
        </p>
      ) : null}
    </section>
  );
}

/** The interactive heart: Anthropic, the one available provider. */
function AnthropicCard({
  initialState,
  canEdit,
}: {
  initialState: OrgModelConnectionState | null;
  canEdit: boolean;
}) {
  // `saved` mirrors the org's stored model connection: null = managed default,
  // nothing stored; a row carries the source (byo active, or managed with the
  // key retained) and the masked hint.
  const [saved, setSaved] = useState<OrgModelConnectionState | null>(
    initialState,
  );
  const [entering, setEntering] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isByo = saved?.credentialSource === "byo";
  const hasStoredKey = saved !== null;
  const maskedHint = saved?.maskedHint ?? null;

  function openEntry() {
    setKeyValue("");
    setError(null);
    setEntering(true);
  }

  function cancelEntry() {
    setEntering(false);
    setKeyValue("");
    setError(null);
  }

  function handleSaveKey() {
    const trimmed = keyValue.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await setBYOModelKey({
        vendor: ANTHROPIC_VENDOR,
        apiKey: trimmed,
      });
      if (!result.ok) {
        // Validate-before-store: a rejected key is never saved. Surface the
        // friendly reason inline and keep the field so the admin can correct it.
        setError(result.error);
        return;
      }
      setSaved({
        credentialSource: "byo",
        maskedHint: result.maskedHint ?? maskedHint,
      });
      setEntering(false);
      setKeyValue("");
      toast.success("Your Anthropic key is set.");
    });
  }

  function handleSwitchToManaged() {
    if (pending) return;
    startTransition(async () => {
      const result = await switchToManaged(ANTHROPIC_VENDOR);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved((prev) =>
        prev ? { credentialSource: "managed", maskedHint: prev.maskedHint } : null,
      );
      toast.success("Switched to legalOS managed models.");
    });
  }

  function handleSwitchToBYO() {
    if (pending) return;
    startTransition(async () => {
      const result = await switchToBYO(ANTHROPIC_VENDOR);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved({
        credentialSource: "byo",
        maskedHint: result.maskedHint ?? maskedHint,
      });
      toast.success("Switched back to your Anthropic key.");
    });
  }

  function handleRemove() {
    if (pending) return;
    startTransition(async () => {
      const result = await clearBYOModelKey(ANTHROPIC_VENDOR);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved(null);
      setEntering(false);
      setRemoveOpen(false);
      toast.success("Your Anthropic key was removed.");
    });
  }

  return (
    <div className="rounded-xl border border-hairline-strong bg-paper-2 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[14.5px] font-medium tracking-[-0.005em] text-foreground">
            Anthropic
          </h3>
          <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
            Claude, the models your agents use today.
          </p>
        </div>
        <StatusPill isByo={isByo} maskedHint={maskedHint} />
      </div>

      {/* Active-credential status — the most important state on the card, read at
          a glance. A small dot ties to the header pill: ink (foreground) when on
          the org's own key, muted when on the managed default. */}
      <div className="mt-4 flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            isByo ? "bg-foreground" : "bg-muted-foreground",
          )}
        />
        <p className="text-[13.5px] font-medium leading-[1.5] text-foreground">
          {isByo
            ? "Using your organization’s Anthropic key"
            : "Using legalOS managed models"}
        </p>
      </div>
      {!isByo && hasStoredKey && maskedHint ? (
        <p className="mt-1 text-[12.5px] leading-[1.5] text-caption">
          A saved Anthropic key ending {maskedHint.replace(/^…/, "")} is kept for
          your organization.
          {canEdit ? " Switch back to it anytime, or remove it." : ""}
        </p>
      ) : null}

      {/* Controls — super admins only. */}
      {canEdit ? (
        entering ? (
          <KeyEntry
            value={keyValue}
            onChange={setKeyValue}
            onSave={handleSaveKey}
            onCancel={cancelEntry}
            pending={pending}
            error={error}
            replacing={isByo}
          />
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isByo ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSwitchToManaged}
                  disabled={pending}
                >
                  Switch to managed
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openEntry}
                  disabled={pending}
                >
                  Replace key
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setRemoveOpen(true)}
                  disabled={pending}
                >
                  Remove key
                </Button>
              </>
            ) : hasStoredKey ? (
              // Managed, but the org's key is still retained — offer a one-click
              // switch back (no re-entry), plus replace and remove.
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSwitchToBYO}
                  disabled={pending}
                >
                  Use your key again
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openEntry}
                  disabled={pending}
                >
                  Replace key
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setRemoveOpen(true)}
                  disabled={pending}
                >
                  Remove saved key
                </Button>
              </>
            ) : (
              // Managed with no retained key — entry flow (a new key required).
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openEntry}
                disabled={pending}
              >
                Bring your own key
              </Button>
            )}
          </div>
        )
      ) : null}

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove your Anthropic key?</DialogTitle>
            <DialogDescription>
              You’ll return to legalOS managed models, and you’ll need to enter
              the key again to use your own. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemoveOpen(false)}
              disabled={pending}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemove}
              disabled={pending}
            >
              {pending ? "Removing…" : "Remove key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The write-only key field with validate-before-store feedback. */
function KeyEntry({
  value,
  onChange,
  onSave,
  onCancel,
  pending,
  error,
  replacing,
}: {
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  replacing: boolean;
}) {
  return (
    <div className="mt-4 rounded-lg border border-hairline bg-background p-4 duration-200 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
      <label
        htmlFor="anthropic-api-key"
        className="text-[13px] font-medium text-foreground"
      >
        {replacing ? "New Anthropic API key" : "Anthropic API key"}
      </label>
      <Input
        id="anthropic-api-key"
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="sk-ant-..."
        autoComplete="off"
        spellCheck={false}
        autoFocus
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "anthropic-api-key-error" : undefined}
        className="mt-2 max-w-[420px] bg-paper-2 font-mono text-[13px]"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
        }}
      />

      {pending ? (
        <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
          Checking your key with Anthropic…
        </p>
      ) : error ? (
        <p
          id="anthropic-api-key-error"
          role="alert"
          className="mt-2 text-[12.5px] leading-[1.5] text-destructive"
        >
          {error}
        </p>
      ) : (
        <p className="mt-2 text-[12.5px] leading-[1.5] text-caption">
          Your key is checked with Anthropic before it’s saved, stored encrypted,
          and never shown again.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onSave}
          disabled={pending || value.trim().length === 0}
        >
          {pending ? "Checking your key…" : "Verify and save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The current-state pill in the card header. */
function StatusPill({
  isByo,
  maskedHint,
}: {
  isByo: boolean;
  maskedHint: string | null;
}) {
  if (isByo) {
    return (
      <span className="shrink-0 rounded-full border border-hairline-strong bg-background px-2.5 py-1 text-[12px] font-medium text-foreground">
        Your key{maskedHint ? ` · ${maskedHint}` : ""}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-hairline bg-background px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
      Managed
    </span>
  );
}

/** A provider-uniform card in its honest coming-soon state. */
function ComingSoonCard({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-paper-2/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-medium tracking-[-0.005em] text-muted-foreground">
          {name}
        </h3>
        <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-caption">
          Coming soon
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-caption">
        {description}
      </p>
    </div>
  );
}
