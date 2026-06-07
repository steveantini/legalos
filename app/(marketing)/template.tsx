/**
 * Per-navigation enter transition for the public marketing surface
 * (D-128). A template remounts on every in-segment navigation, so the
 * `marketing-page-enter` utility replays its ~200ms fade-and-rise each
 * time the page changes. The outgoing page is held until the incoming
 * one is ready (Next's default navigation behavior), so over the
 * shared paper background the swap reads as a gentle crossfade.
 *
 * The landing manages its own arrival motion (full choreography on a
 * cold load, a quick settle on return), so whenever the landing is the
 * destination this fade stands down via CSS (`:has` on the stage's
 * data-arrival attribute in globals.css).
 *
 * Server component — zero client JS.
 */
export default function MarketingTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="marketing-page-enter">{children}</div>;
}
