import "server-only";

import { googleDriveAdapter } from "@/lib/connections/providers/google-drive";
import type { ProviderAdapter } from "@/lib/connections/providers/types";

/**
 * The provider registry: maps a provider id to its OAuth adapter. The flow
 * (initiate + callback) routes purely through this map — the callback reads the
 * provider id from the verified OAuth state, looks the adapter up here, and uses
 * it. Adding a provider is adding one entry here plus its adapter file; no flow,
 * route, storage, or UI changes (D-065).
 *
 * Google Drive is the only adapter this milestone. Calendar, Gmail, Slack, and
 * Microsoft providers join later.
 */

const ADAPTERS: Record<string, ProviderAdapter> = {
  [googleDriveAdapter.providerId]: googleDriveAdapter,
};

/** The adapter for a provider id, or null if no adapter is registered. */
export function getAdapter(providerId: string): ProviderAdapter | null {
  return ADAPTERS[providerId] ?? null;
}

/** Provider ids that currently have a working OAuth adapter. */
export const CONNECTABLE_PROVIDER_IDS = Object.keys(ADAPTERS);

/** Whether a provider id has a registered, connectable adapter. */
export function isConnectable(providerId: string): boolean {
  return providerId in ADAPTERS;
}
