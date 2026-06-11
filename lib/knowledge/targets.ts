import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import { getOrgMcpExecutionTargets } from "@/lib/connections/mcp/connection-state";
import { canServerEnumerate } from "@/lib/connections/providers/mcp-registry";
import { getUsableAccessToken } from "@/lib/connections/tokens";
import {
  hasEnumerationAdapter,
  type EnumerationTarget,
} from "@/lib/knowledge/enumeration";

/**
 * Resolve a connection id to a live enumeration/read target (Knowledge arc):
 * the connection must be the caller's org's, active, on an
 * enumeration-capable catalog server with an implemented adapter. Token
 * custody stays in the established path (getUsableAccessToken — refresh and
 * encrypted storage are never reimplemented here).
 *
 * Shared by the Collections actions (browse, sync) and the research engine
 * (enumerate, read), so eligibility can never drift between the two.
 */
export async function resolveEnumerationTarget(
  connectionId: string,
): Promise<EnumerationTarget | null> {
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return null;
  const targets = await getOrgMcpExecutionTargets(profile.organization_id);
  const target = targets.find((t) => t.connectionId === connectionId);
  if (
    !target ||
    !target.serverUrl ||
    !canServerEnumerate(target.serverId) ||
    !hasEnumerationAdapter(target.serverId)
  ) {
    return null;
  }
  try {
    const accessToken = await getUsableAccessToken(
      target.connectionId,
      target.tokenRef,
    );
    return {
      serverId: target.serverId,
      serverUrl: target.serverUrl,
      accessToken,
    };
  } catch {
    return null;
  }
}
