"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "launchpad_welcomed";

interface WelcomeModalProps {
  departmentName: string;
}

/**
 * Session-scoped welcome modal. Shows on first mount in a given browser
 * tab; dismissal sets a sessionStorage flag so the modal doesn't reopen
 * on navigation or refresh within the same tab.
 *
 * Does NOT collect email/name (the reference repo did this because it
 * was anonymous; we already have the authenticated user's email).
 */
export function WelcomeModal({ departmentName }: WelcomeModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.sessionStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch {
      // sessionStorage disabled — skip showing the modal. Not critical.
    }
  }, []);

  function handleDismiss() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Storage write failed. Modal will show again on the next mount
      // in this tab — acceptable fallback.
    }
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
        } else {
          handleDismiss();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to the {departmentName} launchpad</DialogTitle>
          <DialogDescription>
            Each card opens an AI agent for a common{" "}
            {departmentName.toLowerCase()} task. Click one to launch it in a
            new tab. Use the support button for technical issues, feature
            requests, or access questions.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Got it
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
