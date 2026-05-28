import { getImpactBandData } from "@/lib/workspace/home/impact-math";

import { ImpactBandClient } from "./impact-band-client";

type ImpactBandProps = {
  userId: string;
  /** Gates the calculator CTAs, which route to an admin-only page. */
  isAdmin: boolean;
};

/**
 * Workspace home impact band — server half. Its only job is to fetch all
 * three timeframes (week / month / ytd) for the user and hand them to the
 * client component, which owns the timeframe toggle and the band's visual
 * composition. Pre-fetching all three keeps toggling instant on the client.
 *
 * Awaits `getImpactBandData`, so the page wraps it in Suspense with a
 * matching skeleton.
 */
export async function ImpactBand({ userId, isAdmin }: ImpactBandProps) {
  const data = await getImpactBandData(userId);
  return <ImpactBandClient data={data} isAdmin={isAdmin} />;
}
