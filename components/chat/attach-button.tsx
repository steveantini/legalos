"use client";

import { PaperclipIcon } from "lucide-react";
import { useRef } from "react";

/**
 * The composer's attach affordance: an icon-only paperclip trigger plus a
 * hidden multi-file input. Lives in the tools-row left slot beside the
 * web-search indicator.
 *
 * Paperclip (not a "+"): a paperclip reads as "attach a file" with zero
 * ambiguity across every chat surface users know; a "+" reads as "add
 * something" (a message? a tool? a context block?). Precision over generality.
 *
 * The accept string is hardcoded here (extensions + MIME types) rather than
 * imported from lib/extract/extract.ts, because that module is `server-only`
 * and this is a client component. It mirrors the same allowlist the agent-
 * attachments section uses (PDF, DOCX, TXT, MD, XLSX) and the server re-
 * validates the MIME on upload, so this is a UX filter, not the security
 * boundary.
 */
const ACCEPT_MIME =
  ".pdf,.docx,.txt,.md,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type AttachButtonProps = {
  disabled: boolean;
  /** Shown as the aria-label when disabled at the cap (e.g. "Up to 5 files per message"). */
  reasonWhenDisabled: string | null;
  onFilesSelected: (files: File[]) => void;
};

export function AttachButton({
  disabled,
  reasonWhenDisabled,
  onFilesSelected,
}: AttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) onFilesSelected(files);
    // Reset so picking the same file twice in a row still fires onChange.
    event.target.value = "";
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={
          disabled && reasonWhenDisabled ? reasonWhenDisabled : "Attach file"
        }
        className="inline-flex items-center justify-center rounded-md p-1.5 text-caption transition-colors duration-release ease-release motion-reduce:transition-none hover:text-foreground hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PaperclipIcon className="size-4" aria-hidden />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_MIME}
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
}
