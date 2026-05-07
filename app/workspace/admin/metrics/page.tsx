import Link from "next/link";

import { AdoptionMetrics } from "@/components/admin/metrics/adoption-metrics";

export default function AdminMetricsPage() {
  return (
    <>
      <Link
        href="/workspace/admin"
        className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ← Admin
      </Link>

      <header className="mt-4">
        <h1 className="text-3xl font-semibold">Adoption Metrics</h1>
        <p
          id="metrics-scope-note"
          className="mt-2 max-w-prose text-sm text-muted-foreground"
        >
          Counts below reflect events recorded in this browser only.
          Cross-user and cross-device analytics will replace this view once
          events move from localStorage to the database (see{" "}
          <code className="font-mono text-xs">DECISION_LOG.md</code> D-010).
        </p>
      </header>

      <div aria-describedby="metrics-scope-note">
        <AdoptionMetrics />
      </div>
    </>
  );
}
