"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { browseSourceFolder } from "@/lib/actions/collections";
import type { BrowseEntry, FolderDescriptor } from "@/lib/knowledge/collections-shared";
import type { EligibleSourceConnection } from "@/lib/knowledge/collections-data";
import { cn } from "@/lib/utils";

/**
 * The shared folder picker (Step 2): browse a connected drive's folder tree and
 * pick one OR MORE folders in a single session. Decoupled from any collection,
 * it returns plain folder descriptors; each caller decides what to do with them
 * (Research find-or-creates an invisible folder-backed collection per folder).
 * Lifted from the collections source picker's browse internals; the new part is
 * the picked-folders list with add/remove and a multi-folder confirm. Reusable
 * by Structured Query in step three.
 */

type Crumb = { id: string | null; name: string };

function folderKey(connectionId: string, rootReference: string): string {
  return `${connectionId}::${rootReference}`;
}

export function FolderPickerDialog({
  connections,
  pending,
  onClose,
  onConfirm,
}: {
  connections: EligibleSourceConnection[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (folders: FolderDescriptor[]) => void;
}) {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "Top level" }]);
  const [entries, setEntries] = useState<BrowseEntry[] | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [recursive, setRecursive] = useState(true);
  const [picked, setPicked] = useState<FolderDescriptor[]>([]);

  const currentFolder = crumbs[crumbs.length - 1];
  const connection = connections.find((c) => c.connectionId === connectionId);

  async function loadPage(
    targetConnectionId: string,
    folderId: string | null,
    pageToken: string | null,
    append: boolean,
  ) {
    const result = await browseSourceFolder({
      connectionId: targetConnectionId,
      folderId,
      pageToken,
    });
    if (!result.ok) {
      setBrowseError(result.error);
      if (!append) setEntries([]);
      return;
    }
    setBrowseError(null);
    setEntries((prev) =>
      append ? [...(prev ?? []), ...result.page.entries] : result.page.entries,
    );
    setNextPageToken(result.page.nextPageToken);
  }

  function clearListing() {
    setEntries(null);
    setNextPageToken(null);
    setBrowseError(null);
  }

  async function showMore() {
    if (!connection || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(connection.connectionId, currentFolder.id, nextPageToken, true);
    } finally {
      setLoadingMore(false);
    }
  }

  function selectConnection(id: string) {
    clearListing();
    setCrumbs([{ id: null, name: "Top level" }]);
    setConnectionId(id);
    void loadPage(id, null, null, false);
  }

  function descend(entry: BrowseEntry) {
    if (!connectionId) return;
    clearListing();
    setCrumbs((prev) => [...prev, { id: entry.id, name: entry.name }]);
    void loadPage(connectionId, entry.id, null, false);
  }

  function jumpTo(index: number) {
    if (!connectionId) return;
    const target = crumbs[index];
    clearListing();
    setCrumbs((prev) => prev.slice(0, index + 1));
    void loadPage(connectionId, target.id, null, false);
  }

  function addCurrentFolder() {
    if (!connectionId || !currentFolder.id) return;
    const key = folderKey(connectionId, currentFolder.id);
    if (picked.some((f) => folderKey(f.connectionId, f.rootReference) === key)) return;
    setPicked((prev) => [
      ...prev,
      {
        connectionId,
        rootReference: currentFolder.id!,
        pathNames: crumbs.slice(1).map((crumb) => crumb.name),
        recursive,
        displayName: currentFolder.name,
      },
    ]);
  }

  function removePicked(key: string) {
    setPicked((prev) =>
      prev.filter((f) => folderKey(f.connectionId, f.rootReference) !== key),
    );
  }

  const currentIsPicked =
    !!connectionId &&
    !!currentFolder.id &&
    picked.some(
      (f) => folderKey(f.connectionId, f.rootReference) === folderKey(connectionId, currentFolder.id!),
    );
  const folderCount = (entries ?? []).filter((entry) => entry.isFolder).length;
  const documentCount = (entries ?? []).length - folderCount;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Pick folders</DialogTitle>
          <DialogDescription>
            Browse a connected drive and add the folders to ask over. Each folder
            is referenced by its stable id, so renames and moves don&rsquo;t break
            it.
          </DialogDescription>
        </DialogHeader>

        {!connection ? (
          <div className="flex flex-col gap-2">
            {connections.map((candidate) => (
              <button
                key={candidate.connectionId}
                type="button"
                onClick={() => selectConnection(candidate.connectionId)}
                className="flex items-center rounded-lg border border-hairline bg-paper-2 px-4 py-3 text-left text-[13.5px] font-medium text-foreground transition-colors duration-hover ease-soft hover:bg-secondary motion-reduce:transition-none"
              >
                {candidate.displayName}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted-foreground">
              <span className="font-medium text-foreground">{connection.displayName}</span>
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.id ?? "root"}-${index}`} className="flex items-center gap-1">
                  <span aria-hidden="true">/</span>
                  {index < crumbs.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => jumpTo(index)}
                      className="rounded font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {crumb.name}
                    </button>
                  ) : (
                    <span className="font-medium text-foreground">{crumb.name}</span>
                  )}
                </span>
              ))}
            </p>

            <div className="max-h-[240px] overflow-y-auto rounded-lg border border-hairline bg-background">
              {entries === null && !browseError ? (
                <ul aria-hidden="true" className="flex flex-col">
                  {[0, 1, 2, 3, 4].map((row) => (
                    <li key={row} className="border-b border-hairline px-4 py-2.5 last:border-b-0">
                      <span className="block h-[14px] w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                    </li>
                  ))}
                </ul>
              ) : browseError ? (
                <p role="alert" className="px-4 py-3 text-[13px] leading-[1.5] text-warn-fg">
                  {browseError}
                </p>
              ) : entries === null || entries.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-muted-foreground">
                  This folder is empty.
                </p>
              ) : (
                <ul className="flex flex-col duration-200 animate-in fade-in-0 motion-reduce:animate-none">
                  {entries.map((entry) => (
                    <li key={entry.id} className="border-b border-hairline last:border-b-0">
                      {entry.isFolder ? (
                        <button
                          type="button"
                          onClick={() => descend(entry)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors duration-hover ease-soft hover:bg-paper-2 motion-reduce:transition-none"
                        >
                          <span className="min-w-0 truncate">{entry.name}</span>
                          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                            →
                          </span>
                        </button>
                      ) : (
                        <p className="truncate px-4 py-2.5 text-[13px] text-muted-foreground">
                          {entry.name}
                        </p>
                      )}
                    </li>
                  ))}
                  {nextPageToken ? (
                    <li className="px-4 py-2.5">
                      <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() => void showMore()}
                        className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 motion-reduce:transition-none"
                      >
                        {loadingMore ? "Loading…" : "Show more"}
                      </button>
                    </li>
                  ) : null}
                </ul>
              )}
            </div>

            {entries !== null ? (
              <p className="text-[12px] leading-[1.5] text-caption">
                On this level: {folderCount} {folderCount === 1 ? "folder" : "folders"},{" "}
                {documentCount} {documentCount === 1 ? "document" : "documents"}
                {nextPageToken ? ", with more not yet shown" : ""}.
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={recursive}
                  onChange={(event) => setRecursive(event.target.checked)}
                />
                Include subfolders
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCurrentFolder}
                disabled={!currentFolder.id || currentIsPicked}
                title={
                  !currentFolder.id
                    ? "Open a folder first; the top level can't be picked"
                    : currentIsPicked
                      ? "Already added"
                      : undefined
                }
              >
                {currentIsPicked ? "Added" : "Add this folder"}
              </Button>
            </div>
          </div>
        )}

        {/* The accumulating picked-folders list, removable before confirming. */}
        {picked.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-hairline bg-paper-2 px-3.5 py-3">
            <p className="text-[12px] font-medium text-muted-foreground">
              {picked.length} {picked.length === 1 ? "folder" : "folders"} to add
            </p>
            {picked.map((f) => {
              const key = folderKey(f.connectionId, f.rootReference);
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] text-foreground">
                    {f.displayName}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePicked(key)}
                    className={cn(
                      "shrink-0 rounded px-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(picked)}
            disabled={pending || picked.length === 0}
          >
            {pending
              ? "Adding…"
              : `Use ${picked.length || ""} ${picked.length === 1 ? "folder" : "folders"}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
