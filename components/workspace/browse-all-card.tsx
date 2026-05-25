import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

/**
 * Full-width card on the home that routes to the department directory
 * (/workspace/departments). Horizontal layout (copy left, arrow right);
 * the arrow nudges on hover for a small bit of delight, on the same
 * polish #15 motion tokens as the surrounding cards.
 *
 * Server component — pure navigation, no interactivity.
 */
export function BrowseAllCard() {
  return (
    <Link
      href="/workspace/departments"
      className="group flex items-center justify-between gap-4 rounded-[14px] border border-card-border bg-card p-6 transition-[transform,box-shadow,border-color] duration-release ease-release motion-reduce:transition-none hover:duration-hover hover:ease-soft hover:-translate-y-[2px] hover:border-primary/35 hover:shadow-[0_1px_0_rgba(26,24,22,0.03),0_4px_8px_rgba(26,24,22,0.06),0_22px_38px_-12px_rgba(26,24,22,0.12),0_8px_24px_-8px_rgba(59,86,128,0.12)] active:duration-press active:ease-spring active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex flex-col gap-1">
        <span className="text-[16px] font-medium tracking-[-0.005em] text-foreground">
          Browse all departments
        </span>
        <span className="text-[13.5px] tracking-[-0.005em] text-muted-foreground">
          Practice areas your team works across.
        </span>
      </span>
      <ArrowRightIcon
        aria-hidden="true"
        strokeWidth={1.5}
        className="size-5 shrink-0 text-muted-foreground transition-transform duration-release ease-release group-hover:translate-x-[2px] group-hover:text-foreground group-hover:duration-hover group-hover:ease-soft motion-reduce:transition-none"
      />
    </Link>
  );
}
