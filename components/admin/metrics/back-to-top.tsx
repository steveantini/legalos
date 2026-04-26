"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Floating "Back to Top" button. Visible when the page is scrolled
 * past 300px (matches the source's `window.scrollY > 300` threshold
 * at admin.html line 1976). Smooth-scrolls to top on click.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    function onScroll() {
      setShow(window.scrollY > 300);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 right-6 z-40 shadow-md"
    >
      <ArrowUp className="size-4" />
      Back to Top
    </Button>
  );
}
