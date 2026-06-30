import { permanentRedirect } from "next/navigation";

/**
 * The Integrations stub became the Connections page (Tier 1b, D-127),
 * which in turn folded into the Features product tour (D-146). This
 * redirect points straight at the tour's governance section, where
 * connections now live (D-218 reorg), rather than chaining through
 * /connections, so an old link costs one hop.
 */
export default function IntegrationsPage() {
  permanentRedirect("/features#governance");
}
