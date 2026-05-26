"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface CopyButtonProps {
  /** Text written to the clipboard on click. */
  text: string;
  className?: string;
}

/**
 * Quiet copy-to-clipboard button shown below a completed assistant message.
 * Swaps to a "Copied" check for 2s after a successful copy, then reverts.
 * Failures are swallowed (the clipboard API rejects on insecure contexts /
 * denied permission); the label simply stays "Copy" rather than lying.
 *
 * This is the lightweight copy action; export-to-document (Word) is a
 * separate affordance (DownloadMessageButton) and its own roadmap arc.
 */
export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending revert on unmount so the timer never fires setState on
  // an unmounted component.
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
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy message"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground",
        "transition-colors duration-release ease-release motion-reduce:transition-none",
        "hover:text-foreground hover:duration-hover hover:ease-soft",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
