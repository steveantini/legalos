import type { Metadata } from "next";

import { ComingSoonContent } from "@/components/coming-soon/coming-soon";

export const metadata: Metadata = {
  title: "Profile",
};

/** Profile sub-page, a coming-soon stub. Built in a later arc. */
export default function SettingsProfilePage() {
  return (
    <ComingSoonContent
      label="Profile"
      description="Your name, photo, and account details, in one place."
    />
  );
}
