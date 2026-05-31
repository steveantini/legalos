import {
  CAPABILITY_GROUPS,
  type CapabilityGroup,
  type Provider,
} from "@/lib/settings/connections-data";
import { requireAuthUser } from "@/lib/auth/access";
import { disconnectConnectionAction } from "@/lib/actions/connections";
import { isConnectable } from "@/lib/connections/providers/registry";
import {
  getConnectionStates,
  type ProviderConnectionState,
} from "@/lib/settings/connections";

/**
 * The settings Connections page. Capability-grouped (File storage, Calendar,
 * Mail, Matter management), provider-agnostic, considered register (D-063).
 *
 * As of the OAuth milestone (D-065) this is a real, live surface: it reads the
 * user's connection state from the database and renders each provider's true
 * state. A provider with a registered OAuth adapter (Google Drive today) shows
 * a real Connect link that initiates the flow; once connected, the row shows
 * the connected account and a Disconnect control. Providers without an adapter
 * yet stay inert ("Available soon"). Rendered from `CAPABILITY_GROUPS` joined
 * with live state, so adding a provider stays a data + adapter change.
 *
 * The visual primitives here (capability group, refined provider row, Connect
 * affordance, connected state, org-row differentiation) become the
 * connection-management visual language across the product; the Admin
 * Connections page adopts them at admin scope in a later milestone.
 */

// Calm, non-blaming messages for the error codes the OAuth routes redirect with
// (ux-writing.md: what happened + what to do, never technical detail).
const ERROR_MESSAGES: Record<string, string> = {
  denied:
    "Connection canceled. Access wasn't granted, so nothing was connected.",
  state:
    "That connection attempt couldn't be verified or has expired. Please try connecting again.",
  exchange:
    "We couldn't complete the connection with the provider. Please try again.",
  store: "We couldn't finish setting up the connection. Please try again.",
  not_allowed:
    "Your organization's policy doesn't allow connecting this tool. Contact your admin.",
  unsupported_provider: "That tool can't be connected yet.",
};

export async function ConnectionsPage({
  statusError,
}: {
  statusError?: string;
}) {
  const user = await requireAuthUser();
  const states = await getConnectionStates(user.id);

  // Index the user's active connections by provider id for O(1) row lookups.
  const connectionByProvider = new Map<string, ProviderConnectionState>();
  for (const state of states) {
    if (state.status === "active") {
      connectionByProvider.set(state.providerId, state);
    }
  }

  const errorMessage = statusError ? ERROR_MESSAGES[statusError] : undefined;

  return (
    <main className="w-full max-w-3xl">
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Connections
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          The tools your agents can read from and write to. Connect what you
          use; your agents do the rest.
        </p>
      </header>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-hairline bg-paper-2 px-4 py-3 text-[13px] leading-[1.5] text-foreground"
        >
          {errorMessage}
        </p>
      ) : null}

      {/* Responsive top-aligned grid (D-073). Groups render in their meaningful
          source order and flow left-to-right, top-to-bottom; `items-start` makes
          every group in a grid row share that row's top line while keeping its
          natural height (a shorter group leaves whitespace below itself rather
          than stretching to match the row's tallest group). This is what gives
          the clean shared row lines a pair of independent column stacks could
          not. The max column count is intentionally 2: it's the most these rows
          fit at the settings family's shared `max-w-3xl` (768px) reading width,
          which keeps Connections spatially consistent with the other settings
          pages. Bump `lg:grid-cols-2` to add columns only if a wider width is
          ever adopted. Collapses to a single stack below `lg` (1024px), where
          the rail + page padding would otherwise crowd two columns. `gap-x-8`
          keeps the 32px gutter; `gap-y-10` gives grid rows a clear vertical
          rhythm given the ragged bottoms. */}
      <div className="mt-10 grid grid-cols-1 items-start gap-x-8 gap-y-10 lg:grid-cols-2">
        {CAPABILITY_GROUPS.map((group) => (
          <CapabilityGroupSection
            key={group.id}
            group={group}
            connectionByProvider={connectionByProvider}
          />
        ))}
      </div>
    </main>
  );
}

/**
 * One capability group: title, description, and its provider rows (plus the
 * optional org example). Extracted so the two-column layout can map it into
 * either column without duplicating the markup.
 */
function CapabilityGroupSection({
  group,
  connectionByProvider,
}: {
  group: CapabilityGroup;
  connectionByProvider: Map<string, ProviderConnectionState>;
}) {
  return (
    <section aria-labelledby={`connections-${group.id}`}>
      <h2
        id={`connections-${group.id}`}
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        {group.title}
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        {group.description}
      </p>

      {/* No box frame: groups are delineated by title, description, and
          spacing. Full-width hairlines live on these wrappers (matching the
          settings landing); the padded row inside is the filled surface. */}
      <div className="mt-4">
        {group.providers.map((provider) => (
          <div
            key={provider.id}
            className="border-b border-hairline last:border-b-0"
          >
            <ProviderRow
              provider={provider}
              connection={connectionByProvider.get(provider.id) ?? null}
            />
          </div>
        ))}
        {group.orgExample ? (
          <div className="border-b border-hairline last:border-b-0">
            <OrgProviderRow provider={group.orgExample} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

type DotVariant = "ring" | "solid" | "faint";

/**
 * Grounding state-dot in a fixed-width left column so provider names align to
 * a consistent edge (inset under the group title, reinforcing the
 * list-under-heading hierarchy). "ring" = available but not connected (hollow
 * slate ring, ready to be filled); "solid" = connected; "faint" = coming-soon /
 * dormant. Decorative (aria-hidden): the text status line beside it carries the
 * state for assistive tech, so the dot is visual reinforcement, not the sole
 * signal.
 */
function StateDot({ variant }: { variant: DotVariant }) {
  const dotClass =
    variant === "ring"
      ? "border-[1.5px] border-primary"
      : variant === "solid"
        ? "bg-primary"
        : "bg-muted-foreground/40";
  return (
    <span
      aria-hidden="true"
      className="flex w-7 shrink-0 items-center justify-center"
    >
      <span className={`h-[7px] w-[7px] rounded-full ${dotClass}`} />
    </span>
  );
}

// Human-readable capability summary, e.g. ["read"] → "read access".
function capabilitySummary(capabilities: string[]): string {
  const canWrite = capabilities.includes("write");
  const canRead = capabilities.includes("read");
  if (canRead && canWrite) return "read and write access";
  if (canWrite) return "write access";
  return "read access";
}

/**
 * A personal-provider row. Three states:
 *   - connected: solid dot, "Connected · <account> · read access", Disconnect.
 *   - available (adapter exists, not connected): hollow ring, "Not connected",
 *     a real Connect link that initiates the OAuth flow.
 *   - not yet connectable (no adapter / coming-soon): faint dot, "Available
 *     soon", no affordance.
 */
function ProviderRow({
  provider,
  connection,
}: {
  provider: Provider;
  connection: ProviderConnectionState | null;
}) {
  // "available" in the data means the provider is meant to be connectable; it
  // is actually connectable only once an OAuth adapter is registered for it.
  const connectable = provider.status === "available" && isConnectable(provider.id);
  const isConnected = connection !== null;
  // Actionable rows (a connected row with a Disconnect, or a connectable row
  // with a Connect) respond to the pointer; coming-soon rows are inert.
  const isActionable = isConnected || connectable;

  return (
    <div
      // Calm lighter fill at rest on every row (paper-2). Actionable rows
      // deepen one subtle shade on hover (to stone/secondary) using the shared
      // hover motion tokens; coming-soon rows stay flat.
      className={`flex items-center rounded-lg bg-paper-2 px-5 py-2 ${
        isActionable
          ? "transition-colors duration-release ease-release hover:bg-secondary hover:duration-hover hover:ease-soft motion-reduce:transition-none"
          : ""
      }`}
    >
      <StateDot
        variant={isConnected ? "solid" : connectable ? "ring" : "faint"}
      />
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-foreground">
          {provider.name}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {isConnected
            ? `Connected${
                connection.accountLabel ? ` · ${connection.accountLabel}` : ""
              } · ${capabilitySummary(connection.capabilities)}`
            : connectable
              ? "Not connected"
              : "Available soon"}
        </p>
      </div>

      {isConnected ? (
        // Disconnect: a real form posting a server action. Minimal by design
        // (no confirmation modal yet — reconnecting is a re-consent, not data
        // loss); cleans up the connection, its grant, and the stored token.
        <form
          action={disconnectConnectionAction}
          className="ml-auto shrink-0 pl-4"
        >
          <input type="hidden" name="connectionId" value={connection.connectionId} />
          <button
            type="submit"
            className="rounded-md text-[14px] font-medium text-muted-foreground transition-colors duration-release ease-release hover:text-foreground hover:duration-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            Disconnect
          </button>
        </form>
      ) : connectable ? (
        // A real link initiating the OAuth flow (GET is the conventional shape
        // for an OAuth start; the callback's signed-state cookie is the CSRF
        // defense). Replaces the Milestone-2 inert span with honest semantics.
        <a
          href={`/api/connections/connect?provider=${encodeURIComponent(provider.id)}`}
          className="ml-auto shrink-0 rounded-md pl-4 text-[14px] font-medium text-primary transition-colors duration-release ease-release hover:text-primary/80 hover:duration-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          Connect <span aria-hidden="true">→</span>
        </a>
      ) : null}
    </div>
  );
}

/**
 * The org-level provider row: an admin-connected resource the user cannot act
 * on. Now that every row carries the common calm fill, the background no longer
 * sets it apart; the "Org" badge and the "Connected by your admin" status line
 * carry the ownership distinction (D-073). Informational only: no affordance,
 * and no hover-deepen (it is inert, unlike the actionable personal rows).
 * Static example until real CLM integration ships.
 */
function OrgProviderRow({ provider }: { provider: Provider }) {
  return (
    <div className="flex items-center rounded-lg bg-paper-2 px-5 py-2">
      {/* Faint dot: Ironclad's honest state is "available soon". When org CLM
          integration ships and it is really connected, this becomes "solid". */}
      <StateDot variant="faint" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-medium text-foreground">
            {provider.name}
          </p>
          <span className="rounded-full border-[0.5px] border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Org
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Connected by your admin · read access · available soon
        </p>
      </div>
    </div>
  );
}
