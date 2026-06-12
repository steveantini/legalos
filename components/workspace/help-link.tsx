import { CircleHelpIcon } from "lucide-react";

import { helpHref, type HelpTopic } from "@/lib/workspace/help-links";

/**
 * The quiet per-surface help affordance (Documentation arc Step 2): a small
 * "Help" link placed consistently in a surface's header row, deep-linking to
 * that feature's documentation guide. Consistency over prominence: caption
 * color at rest, the standard hover-deepen, never a floating widget. Opens
 * in a NEW TAB on purpose — the docs are the marketing site, and help must
 * never navigate the workspace away from the work.
 *
 * Server-safe (no hooks); any surface drops it next to its heading. Topics
 * are a typed union over the real guide slugs (lib/workspace/help-links.ts),
 * so an unmapped surface simply has no link — a dead link is a compile
 * error, not a 404.
 */
export function HelpLink({
  topic,
  className = "",
}: {
  topic: HelpTopic;
  className?: string;
}) {
  return (
    <a
      href={helpHref(topic)}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex shrink-0 items-center gap-1 rounded-md text-[12px] font-medium text-caption transition-colors duration-release ease-release hover:text-foreground hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${className}`}
      aria-label="Open the guide for this page (new tab)"
    >
      <CircleHelpIcon className="size-3.5" aria-hidden />
      Help
    </a>
  );
}
