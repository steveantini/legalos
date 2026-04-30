import { MainNav } from "@/components/nav/main-nav";
import { Toaster } from "@/components/ui/sonner";

/**
 * Wraps every authenticated route (everything under the `(app)` route
 * group). Renders the main nav above the page content. The proxy
 * (`proxy.ts` per D-017) handles auth gating before this layout ever
 * runs, so no explicit session check here.
 *
 * Mounts the Sonner Toaster once per session so the soft-delete + undo
 * surface in agent-card.tsx (and any future toast-driven affordances)
 * has a single sink.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MainNav />
      {children}
      <Toaster />
    </>
  );
}
