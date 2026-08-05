import { createFileRoute } from "@tanstack/react-router";
import { CashFlowReport } from "@/components/finance/cashflow-report";
import { useFinanceShell } from "@/components/finance/finance-shell-context";

export const Route = createFileRoute("/_app/finance/reports/cashflow")({
  component: () => {
    const { vatMode } = useFinanceShell();
    return <CashFlowReport vatMode={vatMode} />;
  },
});
