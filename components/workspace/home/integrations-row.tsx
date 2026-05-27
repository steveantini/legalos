import { IntegrationCard } from "./integration-card";

const CONNECTIONS_HREF = "/workspace/integrations/connections";

/**
 * Workspace home integrations row (Stage 4): three "Connect" placeholder
 * cards — Slack, Mail, Drive — in a tight row between the impact band and
 * Continue Working. Server component, fully static.
 *
 * No visible heading: the per-card eyebrows ("Slack · not connected") are
 * self-describing, and a label above them would be redundant. The section
 * still carries an `aria-label` so the region is named for screen readers.
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
    <section aria-label="Integrations" className="grid grid-cols-3 gap-3">
      <IntegrationCard serviceName="Slack" ctaHref={CONNECTIONS_HREF} />
      <IntegrationCard serviceName="Mail" ctaHref={CONNECTIONS_HREF} />
      <IntegrationCard serviceName="Drive" ctaHref={CONNECTIONS_HREF} />
    </section>
  );
}
