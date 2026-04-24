"use client";

import { LifeBuoy } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SupportButtonProps {
  supportEmail: string;
}

/**
 * Floating fixed-position button (bottom-right) that opens a support
 * contact dialog. Contact is a single mailto: link; no form, no Slack
 * field — forkers who want Slack add it here and in the site config.
 */
export function SupportButton({ supportEmail }: SupportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Get support"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <LifeBuoy className="h-6 w-6" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Need support?</DialogTitle>
            <DialogDescription>
              Legal ops handles technical issues, feature requests, and
              requests to add or update agents. Reach out by email and
              we&apos;ll get back to you.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 rounded-md border border-border bg-muted p-4 text-sm">
            <p className="font-medium">Contact</p>
            <a
              href={`mailto:${supportEmail}`}
              className="mt-1 block text-primary underline-offset-2 hover:underline focus-visible:underline"
            >
              {supportEmail}
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
