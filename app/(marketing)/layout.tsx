/**
 * Shared segment for the public marketing surface: the landing plus
 * the marketing pages (D-128). A minimal pass-through for now; the
 * segment exists so the whole surface shares one navigation boundary
 * (see template.tsx for the per-navigation enter transition). Shared
 * chrome may lift here in a later pass.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
