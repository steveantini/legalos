import { permanentRedirect } from "next/navigation";

/**
 * The standalone Connections page folded into the Features product tour
 * (D-146), where connections are one capability among the product's
 * features. A permanent (308) redirect lands old links directly on the
 * tour's Connections section, mirroring the /security → /trust and
 * /integrations → /connections pattern.
 */
export default function ConnectionsPage() {
  permanentRedirect("/features#connections");
}
