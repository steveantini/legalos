import type { Metadata } from "next";

import { ComingSoonContent } from "@/components/coming-soon/coming-soon";

export const metadata: Metadata = {
  title: "Display",
};

/** Display sub-page, a coming-soon stub. Built in a later arc. */
export default function SettingsDisplayPage() {
  return (
    <ComingSoonContent
      label="Display"
      description="How legalOS looks and behaves for you."
    />
  );
}
