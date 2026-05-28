// RETENTION NOTE: Not currently mounted on the workspace home. Removed on
// 2026-05-28 because Slack/Mail/Drive are always-open ambient apps that don't
// need a home-page launcher, and the home should mirror the product's core
// value (agents, matters, impact) rather than surface peripheral integrations.
// Retained for a possible future return as a compact connection-STATUS strip
// (e.g. "3 of 4 tools connected, Mail needs reauth") inside the
// Integrations/Connections surface or onboarding, which is a different concept
// from the launcher removed here. See roadmap note. Safe to delete if that
// never materializes.

import { IntegrationCard } from "./integration-card";

const CONNECTIONS_HREF = "/workspace/integrations/connections";

/**
 * Workspace home integrations row (Stage 4): three "Connect" placeholder
 * cards — Slack, Mail, Drive — between the impact band and Continue
 * Working, under a "Tools" section heading. Server component, fully static.
 *
 * The "Tools" heading shares the unified home-section heading idiom (20px
 * 18px medium); the section is named for screen readers via `aria-labelledby`
 * pointing at that heading.
 *
 * "Mail" / "Drive" are generic service names rather than provider brands
 * (Gmail/Outlook, Google Drive/OneDrive); the connections destination is
 * where the user picks the specific provider, mirroring how the calendar
 * Connect card says "Google or Outlook" without fixing a brand on the card
 * itself. All three CTAs route to the same connections surface, which is
 * where the eventual OAuth flow (Share & connector hub) will live.
 */
export function IntegrationsRow() {
  return (
    <section
      aria-labelledby="tools-section-heading"
      className="flex flex-col gap-5"
    >
      <h2
        id="tools-section-heading"
        className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
      >
        Tools
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <IntegrationCard serviceName="Slack" ctaHref={CONNECTIONS_HREF} />
        <IntegrationCard serviceName="Mail" ctaHref={CONNECTIONS_HREF} />
        <IntegrationCard serviceName="Drive" ctaHref={CONNECTIONS_HREF} />
      </div>
    </section>
  );
}
