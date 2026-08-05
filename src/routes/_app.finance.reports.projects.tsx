import { createFileRoute } from "@tanstack/react-router";
import { ReceivablesPayablesReport } from "@/components/finance/receivables-payables";
import { useFinanceShell } from "@/components/finance/finance-shell-context";

export const Route = createFileRoute("/_app/finance/reports/projects")({
  component: () => {
    const { vatMode } = useFinanceShell();
    return <ReceivablesPayablesReport vatMode={vatMode} />;
  },
});
