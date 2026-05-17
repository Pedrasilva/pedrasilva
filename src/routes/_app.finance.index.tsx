import { createFileRoute } from "@tanstack/react-router";
import { OperationalOverview } from "@/components/finance/operational-overview";

export const Route = createFileRoute("/_app/finance/")({
  component: FinanceOverviewPage,
});

function FinanceOverviewPage() {
  return <OperationalOverview />;
}
