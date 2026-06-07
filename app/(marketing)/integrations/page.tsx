import { permanentRedirect } from "next/navigation";

/**
 * The Integrations stub became the Connections page at /connections
 * (marketing Tier 1b, D-127), matching the in-product vocabulary. A
 * permanent (308) redirect keeps any old /integrations link landing on
 * the live page, mirroring the /security → /trust pattern from Tier 1a.
 */
export default function IntegrationsPage() {
  permanentRedirect("/connections");
}
