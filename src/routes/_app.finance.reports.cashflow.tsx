import { createFileRoute } from "@tanstack/react-router";
import { CashFlowSection } from "@/components/finance/sections/legacy-sections";
import { useFinanceShell } from "@/components/finance/finance-shell-context";

export const Route = createFileRoute("/_app/finance/reports/cashflow")({
  component: () => {
    const { vatMode } = useFinanceShell();
    return <CashFlowSection vatMode={vatMode} />;
  },
});
