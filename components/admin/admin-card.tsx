import Link from "next/link";

interface AdminCardProps {
  title: string;
  description: string;
  href: string;
}

/**
 * Card for the admin landing page. Styled to match agent cards on
 * department launchpads (same shadcn token set, same hover + focus
 * patterns) for visual consistency across the app.
 */
export function AdminCard({ title, description, href }: AdminCardProps) {
  return (
    <Link
      href={href}
      className="flex min-h-[140px] flex-col justify-center rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
