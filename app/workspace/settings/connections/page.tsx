import type { Metadata } from "next";

import { ComingSoonContent } from "@/components/coming-soon/coming-soon";

export const metadata: Metadata = {
  title: "Connections",
};

/**
 * Connections sub-page, a coming-soon stub for Milestone 1. The real
 * Connections UI replaces this in Milestone 2 of the connector hub arc;
 * the URL stays stable across the stub-to-real swap.
 */
export default function SettingsConnectionsPage() {
  return (
    <ComingSoonContent
      label="Connections"
      description="Connect your tools, Drive, Calendar, and more, so your agents can read from and write to the systems you already use. Building in the next milestone of this arc."
    />
  );
}
