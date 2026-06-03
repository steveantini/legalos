"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { updateConnectionPolicyAction } from "@/lib/actions/connection-policy";

/** A capability category as the editor presents it (display only). */
type PolicyCategory = {
  id: string;
  title: string;
  description: string;
};

/**
 * The connection-policy editor (admin Policy & access, A2). Two governance
 * decisions over the singleton `connection_policy` row:
 *
 *   1. The capability ceiling — one global "the most any connection can do":
 *      read only (the safe default) or read and write.
 *   2. Allowed connection categories — which kinds of connections are permitted.
 *      Providers are derived from categories server-side, so the super-admin
 *      thinks only in categories and the policy can never strand a provider.
 *
 * Super-admins (`canEdit`) get interactive controls; every other admin sees the
 * same state rendered read only (the ceiling posture, allowed / not allowed per
 * category) with no controls and no save path. Editing mirrors the established
 * admin idiom (default-departments): optimistic update in a transition, revert
 * and `toast.error` on failure, a quiet `toast.success` on save. Every change
 * sends the full desired state; `allowed_providers` and the ceiling array are
 * recomputed server-side from it.
 */
export function PolicyEditor({
  categories,
  initialAllowWrite,
  initialAllowedCategories,
  canEdit,
}: {
  categories: PolicyCategory[];
  initialAllowWrite: boolean;
  initialAllowedCategories: string[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [allowWrite, setAllowWrite] = useState(initialAllowWrite);
  const [allowed, setAllowed] = useState<Set<string>>(
    () => new Set(initialAllowedCategories),
  );

  function save(
    nextAllowWrite: boolean,
    nextAllowed: Set<string>,
    prevAllowWrite: boolean,
    prevAllowed: Set<string>,
  ) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("allow_write", nextAllowWrite ? "1" : "0");
      for (const id of nextAllowed) formData.append("category", id);

      const result = await updateConnectionPolicyAction(formData);
      if (!result.ok) {
        setAllowWrite(prevAllowWrite);
        setAllowed(prevAllowed);
        toast.error(result.error);
        return;
      }
      toast.success("Policy updated.");
    });
  }

  function chooseCeiling(nextAllowWrite: boolean) {
    if (!canEdit || pending || nextAllowWrite === allowWrite) return;
    const prevAllowWrite = allowWrite;
    const prevAllowed = allowed;
    setAllowWrite(nextAllowWrite);
    save(nextAllowWrite, allowed, prevAllowWrite, prevAllowed);
  }

  function toggleCategory(id: string) {
    if (!canEdit || pending) return;
    const prevAllowWrite = allowWrite;
    const prevAllowed = allowed;
    const next = new Set(allowed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAllowed(next);
    save(allowWrite, next, prevAllowWrite, prevAllowed);
  }

  const ceilingOptions = [
    { allowWrite: false, label: "Read only" },
    { allowWrite: true, label: "Read and write" },
  ];

  return (
    <section aria-labelledby="policy-allowed-connections" className="mt-12">
      <h2
        id="policy-allowed-connections"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        Allowed connections
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        The standing guardrail on what your agents can reach: the most any
        connection may do, and which kinds your organization permits.
      </p>

      {/* The capability ceiling — compact, inline-labeled. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[13px] font-medium text-foreground">
          The most any connection can do
        </span>
        <div
          role="radiogroup"
          aria-label="The most any connection can do"
          className="inline-flex gap-1 rounded-lg border border-hairline bg-paper-2 p-0.5"
        >
          {ceilingOptions.map((option) => {
            const selected = allowWrite === option.allowWrite;
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!canEdit || pending}
                onClick={() => chooseCeiling(option.allowWrite)}
                className={
                  selected
                    ? "rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-colors duration-release ease-release motion-reduce:transition-none"
                    : `rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-release ease-release focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${
                        canEdit
                          ? "hover:text-foreground hover:duration-hover hover:ease-soft"
                          : "cursor-default"
                      }`
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 max-w-[70ch] text-[12.5px] leading-[1.5] text-caption">
        {allowWrite
          ? "Agents can also make changes in your connected tools, with your approval."
          : "Agents can reference your connected tools, but never change anything in them."}
      </p>

      {/* Allowed connection categories — a compact list (providers derived on save). */}
      <div className="mt-4 overflow-hidden rounded-lg border border-hairline">
        {categories.map((category) => {
          const isAllowed = allowed.has(category.id);
          return (
            <div
              key={category.id}
              className="flex items-center gap-4 border-b border-hairline bg-paper-2 px-4 py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-foreground">
                  {category.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground">
                  {category.description}
                </p>
              </div>
              <div className="ml-auto shrink-0">
                {canEdit ? (
                  <Switch
                    checked={isAllowed}
                    onCheckedChange={() => toggleCategory(category.id)}
                    disabled={pending}
                    aria-label={`Allow ${category.title}`}
                  />
                ) : (
                  <span
                    className={`text-[12px] font-medium ${
                      isAllowed ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {isAllowed ? "Allowed" : "Not allowed"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 max-w-[70ch] text-[12px] leading-[1.5] text-caption">
        Allowing a category permits that kind of connection. Individual providers
        become connectable as support for them ships.
      </p>

      {!canEdit ? (
        <p className="mt-3 text-[13px] leading-[1.5] text-caption">
          Only super admins can change allowed connections. You’re viewing it as
          read only.
        </p>
      ) : null}
    </section>
  );
}
