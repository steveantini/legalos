import {
  CAPABILITY_GROUPS,
  type Provider,
} from "@/lib/settings/connections-data";

/**
 * The settings Connections page. Capability-grouped (File storage, Calendar,
 * Mail, Matter management), provider-agnostic, considered register (D-063).
 * Server component, no client interactivity: the Connect affordances are inert
 * visual elements for this milestone (no OAuth, no state); they become real
 * interactive controls when the OAuth flow ships in a later milestone.
 *
 * Reads as a sibling to the settings landing: the same canonical 44px
 * page-title scale, the same muted tagline treatment, and the same
 * flat-at-rest / rounded-highlight-on-hover row treatment. Capability groups
 * are delineated by title, description, and spacing rather than box frames,
 * so the page and the landing share one interaction language. The org row is
 * the one principled exception to flat-at-rest: it carries a permanent subtle
 * tint because the tint encodes admin-ownership, not decoration. Rendered
 * entirely from `CAPABILITY_GROUPS`, so the real data layer can replace the
 * hardcoded providers without a UI rebuild.
 *
 * The visual primitives here (capability group, refined provider row, Connect
 * affordance, org-row differentiation) become the connection-management visual
 * language across the product; the Admin Connections page adopts them at admin
 * scope in a later milestone.
 */
export function ConnectionsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl">
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Connections
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          The tools your agents can read from and write to. Connect what you
          use; your agents do the rest.
        </p>
      </header>

      <div className="mt-14 flex flex-col gap-12">
        {CAPABILITY_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`connections-${group.id}`}>
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
                spacing. Full-width hairlines live on these wrappers (matching
                the settings landing); the padded row inside is the surface
                that takes the rounded hover highlight. */}
            <div className="mt-6">
              {group.providers.map((provider) => (
                <div
                  key={provider.id}
                  className="border-b border-hairline last:border-b-0"
                >
                  <ProviderRow provider={provider} />
                </div>
              ))}
              {group.orgExample ? (
                <div className="border-b border-hairline last:border-b-0">
                  <OrgProviderRow provider={group.orgExample} />
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

/**
 * A personal-provider row. "available" rows respond to hover (a subtle lift,
 * the same bg-paper-2 treatment as the settings landing rows) and carry an
 * inert "Connect" affordance; "coming-soon" rows are calm and static.
 */
function ProviderRow({ provider }: { provider: Provider }) {
  const available = provider.status === "available";

  return (
    <div
      className={`flex items-center gap-4 px-5 py-4 ${
        available
          ? "rounded-lg transition-colors duration-release ease-release hover:bg-paper-2 hover:duration-hover hover:ease-soft motion-reduce:transition-none"
          : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-foreground">
          {provider.name}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {available ? "Not connected" : "Available soon"}
        </p>
      </div>

      {available ? (
        // Inert in this milestone: a non-interactive span styled like the
        // app's Connect CTAs, so we ship no broken navigation. It becomes a
        // real interactive control (with proper button/link semantics) when
        // the OAuth flow ships in a later milestone. The arrow is decorative.
        <span className="ml-auto shrink-0 text-[14px] font-medium text-primary">
          Connect <span aria-hidden="true">→</span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * The org-level provider row: an admin-connected resource the user cannot act
 * on. Visually differentiated from personal providers by a subtle bg tint and
 * an "Org" badge, and informational only (no affordance, no hover). Static
 * example until real CLM integration ships.
 */
function OrgProviderRow({ provider }: { provider: Provider }) {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-paper-2 px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-medium text-foreground">
            {provider.name}
          </p>
          <span className="rounded-full border-[0.5px] border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Org
          </span>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Connected by your admin · read access · available soon
        </p>
      </div>
    </div>
  );
}
