import Link from "next/link";

/**
 * Marketing landing footer (Session 22 Step B).
 *
 * Server component. Four-column grid on desktop (brand block + three
 * link columns), collapsing to 2 columns at 960px and 1 column at
 * 720px. A subfooter row hosts the copyright and version chip on the
 * right; both stack on mobile.
 *
 * Fades in via `landing-el-in` at 3700ms so it lands after the hero's
 * choreography settles. The brand-mark dot here is rendered statically
 * (no scale-in animation) — only the topbar's dot animates.
 */

const PRODUCT_LINKS = [
  { label: "Workspace", href: "/workspace" },
  { label: "Integrations", href: "/integrations" },
  { label: "Pricing", href: "/pricing" },
] as const;

const RESOURCE_LINKS = [
  { label: "Documentation", href: "/documentation" },
  { label: "Blog", href: "/blog" },
  { label: "FAQ", href: "/faq" },
] as const;

const COMPANY_LINKS = [
  { label: "About", href: "/about" },
  { label: "Our Mission", href: "/mission" },
  { label: "Legal", href: "/legal" },
  { label: "Security", href: "/security" },
  { label: "Contact", href: "/contact" },
] as const;

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith("mailto:") || href.startsWith("http");
  const className =
    "text-[14px] text-ink-2 transition-colors duration-[180ms] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  if (isExternal) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function LandingFooter() {
  return (
    <footer
      className="landing-el-in border-t border-hairline-strong px-6 pb-7 pt-14 min-[720px]:mx-10 min-[720px]:px-0"
      style={{ animationDelay: "3700ms" }}
    >
      <div className="grid grid-cols-1 gap-12 min-[720px]:grid-cols-2 min-[960px]:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-[10px] text-[15px] font-semibold tracking-[-0.015em] text-foreground">
            <span
              aria-hidden
              className="inline-block h-[7px] w-[7px] rounded-full bg-primary"
            />
            legalOS
          </div>
          <p className="mt-5 max-w-[36ch] text-[13px] leading-[1.55] text-muted-foreground">
            The connected workspace and operating system for modern legal
            departments. Built around how legal work actually happens.
          </p>
        </div>

        <div>
          <p className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
            Product
          </p>
          <ul className="flex flex-col gap-3">
            {PRODUCT_LINKS.map((l) => (
              <li key={l.label}>
                <FooterLink href={l.href}>{l.label}</FooterLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
            Resources
          </p>
          <ul className="flex flex-col gap-3">
            {RESOURCE_LINKS.map((l) => (
              <li key={l.label}>
                <FooterLink href={l.href}>{l.label}</FooterLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
            Company
          </p>
          <ul className="flex flex-col gap-3">
            {COMPANY_LINKS.map((l) => (
              <li key={l.label}>
                <FooterLink href={l.href}>{l.label}</FooterLink>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-start gap-[10px] border-t border-hairline pt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-caption min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between min-[720px]:gap-0">
        <span>
          © 2026 <span style={{ textTransform: "none" }}>legalOS</span>
        </span>
        <span style={{ textTransform: "none" }}>v0.1.0</span>
      </div>
    </footer>
  );
}
