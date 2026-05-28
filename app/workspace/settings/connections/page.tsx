import type { Metadata } from "next";

import { ConnectionsPage } from "@/components/workspace/settings/connections-page";

export const metadata: Metadata = {
  title: "Connections",
};

/**
 * Connections sub-page. Thin route wrapper; the real page renders in
 * `ConnectionsPage` (`components/workspace/settings/connections-page.tsx`),
 * keeping this route file minimal. The coming-soon stub it replaced shipped
 * in Milestone 1; this is the Milestone 2 UI.
 */
export default function SettingsConnectionsPage() {
  return <ConnectionsPage />;
}
