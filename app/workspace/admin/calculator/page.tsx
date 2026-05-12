import { ProductivityCalculator } from "@/components/admin/calculator/productivity-calculator";

export default function AdminCalculatorPage() {
  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold">Productivity Calculator</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Add team members and their tasks to calculate the time and cost
          savings of using custom agents.
        </p>
      </header>

      <ProductivityCalculator />
    </>
  );
}
