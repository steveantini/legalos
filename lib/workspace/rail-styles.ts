/**
 * Shared rail className tokens. Both `WorkspaceRail` and `AdminRail`
 * consume these so the two rails cannot drift on link styling, captions,
 * or active treatments.
 *
 * `captionLabel` is typographic-only (no margins). Rail consumers add
 * `mx-2 mb-2`; the admin landing applies its own margin. Splitting the
 * margin out kept both call sites readable without reaching for a
 * className-merge helper.
 *
 * `lockedLink` is intentionally NOT here — it's workspace-rail-specific
 * (the muted treatment for locked departments doesn't have an admin
 * analogue) and stays inline in `workspace-rail.tsx`.
 */

export const linkBase =
  "flex items-center justify-between rounded-lg px-3 py-[7px] text-[13.5px] font-[450] tracking-[-0.005em] text-ink-2 transition-colors duration-150 hover:bg-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const linkActive =
  "bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary";

export const captionLabel =
  "font-mono text-[10px] uppercase tracking-[0.14em] text-caption";
