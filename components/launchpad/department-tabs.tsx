import Link from "next/link";

interface DepartmentTabOption {
  slug: string;
  name: string;
}

interface DepartmentTabsProps {
  /** Slug of the department whose page we're currently rendering. */
  activeSlug: string;
  /** Departments the current user has access to, in display order. */
  departments: DepartmentTabOption[];
}

/**
 * Horizontal tab bar across the top of department pages. Server-rendered;
 * each tab is a `<Link>` with the active tab marked via aria-current and
 * a bottom-border highlight. The container is overflow-x-auto so narrow
 * viewports get a scrollable row instead of wrapping to a second line.
 *
 * Hand-rolled rather than coerced from shadcn's tabs primitive, which is
 * for in-page controlled tabs with content panes — a different shape
 * than route-based navigation. Underline style stays inside the existing
 * token system (border-primary on active, border-transparent on
 * inactive) and matches the convention set by the main nav above it.
 */
export function DepartmentTabs({
  activeSlug,
  departments,
}: DepartmentTabsProps) {
  if (departments.length === 0) return null;

  return (
    <nav aria-label="Departments" className="border-b border-border">
      <ul className="flex overflow-x-auto">
        {departments.map((dept) => {
          const isActive = dept.slug === activeSlug;
          return (
            <li key={dept.slug} className="shrink-0">
              <Link
                href={`/departments/${dept.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {dept.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
