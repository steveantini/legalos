"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adoptRenewalWatcher } from "@/lib/actions/workflows";
import { AUTONOMY_CHOICES } from "@/lib/workflows/autonomy-choices";
import {
  DEFAULT_WATCHER_WINDOW_DAYS,
  WATCHER_CADENCES,
  type WatcherCadence,
} from "@/lib/workflows/watchers-shared";
import { cn } from "@/lib/utils";

type Autonomy = "supervised" | "autonomous";

export type AdoptableCollection = { id: string; name: string };

/**
 * The watcher adopt form (Stage 3a, D-224): pick the collection to watch, the
 * lookahead window, a cadence preset, and the autonomy the spawned runs use.
 * One submit creates the active watcher and its schedule together — the
 * deliberate one-step path a watcher takes instead of fork-then-edit. The
 * autonomy radio cards are the run form's shared fieldset (one wording for the
 * writes-always-pause contract); the collection Select follows the admin
 * invite-person Select idiom.
 */
export function AdoptWatcherForm({
  templateId,
  collections,
}: {
  templateId: string;
  collections: AdoptableCollection[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [collectionId, setCollectionId] = useState<string>(
    collections.length === 1 ? collections[0].id : "",
  );
  const [windowDays, setWindowDays] = useState<string>(
    String(DEFAULT_WATCHER_WINDOW_DAYS),
  );
  const [cadence, setCadence] = useState<WatcherCadence>("daily");
  const [autonomy, setAutonomy] = useState<Autonomy>("supervised");
  const [error, setError] = useState<string | null>(null);

  function adopt() {
    setError(null);
    const parsedWindow = Number(windowDays);
    if (!collectionId) {
      setError("Choose the collection of agreements to watch.");
      return;
    }
    if (!Number.isInteger(parsedWindow) || parsedWindow < 1 || parsedWindow > 365) {
      setError("The window is a number of days between 1 and 365.");
      return;
    }
    startTransition(async () => {
      const res = await adoptRenewalWatcher({
        templateId,
        collectionId,
        windowDays: parsedWindow,
        cadence,
        autonomyLevel: autonomy,
      });
      if (res.ok) {
        toast.success("Watcher adopted. It runs on its schedule from now on.");
        router.push("/workspace/workflows/my-workflows");
        router.refresh();
        return;
      }
      setError(
        res.errors?.join(" ") ??
          res.error ??
          "The watcher couldn't be adopted. Try again.",
      );
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Label htmlFor="watcher-collection">Collection to watch</Label>
        <Select
          value={collectionId}
          onValueChange={(v) => v && setCollectionId(v)}
          disabled={pending}
        >
          <SelectTrigger id="watcher-collection" className="w-full bg-paper-2">
            <SelectValue placeholder="Choose a collection" />
          </SelectTrigger>
          <SelectContent>
            {collections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[12.5px] text-muted-foreground">
          Collections whose document kind tracks an expiration date. The watcher
          reads the prepared values; it never re-extracts.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="watcher-window">Window (days)</Label>
        <Input
          id="watcher-window"
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={windowDays}
          onChange={(e) => setWindowDays(e.target.value)}
          disabled={pending}
          className="w-32"
          aria-describedby="watcher-window-hint"
        />
        <p id="watcher-window-hint" className="text-[12.5px] text-muted-foreground">
          An agreement expiring within this many days becomes a finding.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Cadence</legend>
        <div className="mt-1 flex gap-3">
          {WATCHER_CADENCES.map((choice) => {
            const selected = cadence === choice.value;
            return (
              <label
                key={choice.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-[14px] border bg-card px-4 py-3 transition-colors",
                  selected ? "border-primary/60" : "border-border hover:bg-muted/40",
                )}
              >
                <input
                  type="radio"
                  name="watcher-cadence"
                  value={choice.value}
                  checked={selected}
                  onChange={() => setCadence(choice.value)}
                  disabled={pending}
                  className="accent-primary"
                />
                <span className="text-[14px] font-medium text-foreground">
                  {choice.label}
                </span>
                {choice.value === "daily" ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    Default
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          Autonomy for its runs
        </legend>
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AUTONOMY_CHOICES.map((choice) => {
            const selected = autonomy === choice.value;
            return (
              <label
                key={choice.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-[14px] border bg-card p-4 transition-colors",
                  selected ? "border-primary/60" : "border-border hover:bg-muted/40",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="watcher-autonomy"
                    value={choice.value}
                    checked={selected}
                    onChange={() => setAutonomy(choice.value as Autonomy)}
                    disabled={pending}
                    className="accent-primary"
                  />
                  <span className="text-[14px] font-medium text-foreground">
                    {choice.title}
                  </span>
                  {choice.value === "supervised" ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </span>
                <span className="pl-[26px] text-[12.5px] leading-[1.5] text-muted-foreground">
                  {choice.description}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        <Button type="button" onClick={adopt} disabled={pending}>
          {pending ? "Adopting…" : "Adopt this watcher"}
        </Button>
        <p className="text-[12.5px] text-muted-foreground">
          You own this watcher; its runs are attributed to you.
        </p>
      </div>
    </div>
  );
}
