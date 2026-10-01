import { createFileRoute } from "@tanstack/react-router";
import { FinanceSnapshotBlock } from "@/components/finance/finance-snapshot-block";
import { OperationalOverview } from "@/components/finance/operational-overview";

export const Route = createFileRoute("/_app/finance/")({
  component: FinanceOverviewPage,
});

function FinanceOverviewPage() {
  return (
    <div className="space-y-6">
      <FinanceSnapshotBlock />
      <OperationalOverview />
    </div>
  );
}
