type ComingSoonCardProps = {
  title: string;
  description: string;
};

/**
 * A card for a workspace surface that exists in the product's
 * information architecture but hasn't shipped yet.
 *
 * Deliberately distinct from `LockedDepartmentCard`, which communicates
 * "you can't access this" with a muted, recessed treatment and a lock
 * icon. This card communicates "this hasn't been built yet": the title
 * stays full-opacity ink (the surface is real and planned), a quiet
 * "Coming soon" pill sits top-right, and the description explains what
 * the surface will do. Two different states, two different visual
 * languages, so users never confuse "denied" with "not yet here".
 *
 * Non-interactive by design: there is nothing to navigate to yet, so
 * the card is NOT a link, NOT a button, has no hover lift, and is NOT in
 * the tab order. Per the accessibility skill, focusable elements should
 * be actionable; a non-actionable tab stop is an anti-pattern. Screen
 * reader users still reach the content through reading mode and heading
 * navigation, which is why the title is a real `<h2>` (the page's `<h1>`
 * is the group name, giving a clean h1 -> h2 outline) inside a semantic
 * `<article>` (self-contained content). The "Coming soon" state is
 * carried by text, not color alone (WCAG 1.4.1).
 *
 * Visual rhythm matches the department grid (same radius, border token,
 * and padding) so the placeholder reads as part of the same surface
 * family, just quieter.
 */
export function ComingSoonCard({ title, description }: ComingSoonCardProps) {
  return (
    <article className="flex min-h-[160px] flex-col gap-3 rounded-[14px] border border-border bg-card p-[22px]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[19px] font-medium leading-[1.15] tracking-[-0.018em] text-foreground">
          {title}
        </h2>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Coming soon
        </span>
      </div>
      <p className="text-[13px] leading-[1.45] text-muted-foreground">
        {description}
      </p>
    </article>
  );
}
