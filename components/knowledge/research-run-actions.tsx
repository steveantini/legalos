"use client";

import {
  FileTextIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteResearchRun } from "@/lib/actions/research";
import { cn } from "@/lib/utils";

/**
 * The run view's overflow ("kebab") menu — the SAME destination-hub idiom as
 * the chat message action row (message-actions-menu.tsx): one quiet trigger,
 * export and management actions as items. "Export to Word (.docx)" ports the
 * chat item's behavior verbatim (fetch the export route, blob download,
 * error toast; pending spinner on the item with the menu held open); it is
 * enabled only for settled runs, since an in-progress run has no memo yet.
 * "Delete run" confirms with the established dialog and is likewise gated to
 * settled runs (cancel first — honest message in the disabled state).
 */
export function ResearchRunActions({
  runId,
  terminal,
  canDelete,
}: {
  runId: string;
  /** Completed/failed/cancelled — the states that export and delete. */
  terminal: boolean;
  /** Owner or org/super admin. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [exporting, startExport] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, startDelete] = useTransition();

  function handleExport() {
    startExport(async () => {
      let response: Response;
      try {
        response = await fetch(`/api/exports/research/${runId}/docx`);
      } catch {
        toast.error("Could not export the run. Check your connection.");
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(
          body.error === "not_exportable"
            ? "This run is still in progress; it can be exported once it settles."
            : "Could not export the run. Try again.",
        );
        return;
      }
      const blob = await response.blob();
      const filename =
        parseFilename(response.headers.get("content-disposition")) ??
        "research-run.docx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  }

  function handleDelete() {
    if (deleting) return;
    startDelete(async () => {
      const result = await deleteResearchRun(runId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Run deleted. Cost records are retained.");
      router.push("/workspace/knowledge/research");
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More actions"
          className={cn(
            "inline-flex items-center justify-center rounded-md p-1.5 text-caption",
            "transition-colors duration-release ease-release motion-reduce:transition-none",
            "hover:text-foreground hover:duration-hover hover:ease-soft",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <MoreHorizontalIcon className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4}>
          <DropdownMenuItem
            disabled={exporting || !terminal}
            closeOnClick={false}
            onClick={handleExport}
            title={
              terminal ? undefined : "Available once the run settles"
            }
          >
            {exporting ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileTextIcon className="size-4" aria-hidden />
            )}
            Export to Word (.docx)
          </DropdownMenuItem>
          {canDelete ? (
            <DropdownMenuItem
              disabled={!terminal || deleting}
              onClick={() => setConfirmOpen(true)}
              title={terminal ? undefined : "Cancel the run first, then delete it"}
            >
              <Trash2Icon className="size-4" aria-hidden />
              Delete run
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this research run?</DialogTitle>
            <DialogDescription>
              Its findings will be removed. Cost records are retained.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/filename="?([^"]+)"?/);
  return match ? match[1] : null;
}
