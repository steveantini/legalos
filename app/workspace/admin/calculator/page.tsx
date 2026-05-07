import Link from "next/link";

import { ProductivityCalculator } from "@/components/admin/calculator/productivity-calculator";

export default function AdminCalculatorPage() {
  return (
    <>
      <Link
        href="/workspace/admin"
        className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ← Admin
      </Link>

      <header className="mt-4">
        <h1 className="text-3xl font-semibold">Productivity Gains Calculator</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Add team members and their tasks to calculate the time and cost
          savings of using custom agents.
        </p>
      </header>

      <ProductivityCalculator />
    </>
  );
}
