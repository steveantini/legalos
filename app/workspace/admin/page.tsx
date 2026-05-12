import { AdminCard } from "@/components/admin/admin-card";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/nav";
import { captionLabel } from "@/lib/workspace/rail-styles";

/**
 * Admin landing — grouped cards driven by `ADMIN_NAV_GROUPS`
 * (`lib/admin/nav.ts`). The same source-of-truth array powers the
 * admin rail (`components/workspace/admin-rail.tsx`); adding a new
 * admin tool is one entry in that file and both surfaces update.
 *
 * Section captions use the rail's `captionLabel` typographic token so
 * the landing and the rail share vocabulary visually. Caption margins
 * are landing-specific (`mb-3`) — the rail composes its own
 * (`mx-2 mb-2`) at its call sites per `lib/workspace/rail-styles.ts`.
 */
export default function AdminLandingPage() {
  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Administrative tools for legal ops. More sections arrive in later
          phases.
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-10">
        {ADMIN_NAV_GROUPS.map((group) => (
          <section key={group.caption}>
            <h2 className={`${captionLabel} mb-3`}>{group.caption}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {group.items.map((item) => (
                <AdminCard
                  key={item.href}
                  title={item.label}
                  description={item.description}
                  href={item.href}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
