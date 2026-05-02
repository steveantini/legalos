import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon/coming-soon";

export const metadata: Metadata = {
  title: "Coming soon",
};

export default async function ComingSoonAreaPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  return <ComingSoon area={area} />;
}
