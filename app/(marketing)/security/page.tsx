import { permanentRedirect } from "next/navigation";

/**
 * The Security coming-soon stub became the Trust Center at /trust
 * (marketing Tier 1a, D-126). A permanent (308) redirect keeps any old
 * /security link landing on the live page.
 */
export default function SecurityPage() {
  permanentRedirect("/trust");
}
