import { permanentRedirect } from "next/navigation";

/**
 * The standalone Connections page folded into the Features product tour
 * (D-146), where connections are one capability among the product's
 * features. A permanent (308) redirect lands old links on the tour's
 * governance section, where connections now live (the D-218 reorg folded
 * the standalone Connections section into Admin and governance).
 */
export default function ConnectionsPage() {
  permanentRedirect("/features#governance");
}
