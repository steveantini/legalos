import { MainNav } from "@/components/nav/main-nav";

/**
 * Wraps every authenticated route (everything under the `(app)` route
 * group). Renders the main nav above the page content. The proxy
 * (`proxy.ts` per D-017) handles auth gating before this layout ever
 * runs, so no explicit session check here.
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
    </>
  );
}
