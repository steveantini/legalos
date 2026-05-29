import type { Metadata } from "next";

import { ConnectionsPage } from "@/components/workspace/settings/connections-page";

export const metadata: Metadata = {
  title: "Connections",
};

/**
 * Connections sub-page. Thin route wrapper; the real page renders in
 * `ConnectionsPage` (`components/workspace/settings/connections-page.tsx`),
 * keeping this route file minimal. The coming-soon stub it replaced shipped
 * in Milestone 1; the Milestone 2 UI became live in the OAuth milestone.
 *
 * The OAuth routes redirect back here with `?error=<code>` (failed/denied) or
 * `?connected=<providerId>` (success); the error code is forwarded to the page
 * for a calm inline message. The connected state needs no query param — the
 * page reads it from the database.
 */
export default async function SettingsConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { error } = await searchParams;
  return <ConnectionsPage statusError={error} />;
}
