import { createFileRoute } from "@tanstack/react-router";
import { IncomeSection } from "@/components/finance/sections/legacy-sections";
import { useFinanceShell } from "@/components/finance/finance-shell-context";

export const Route = createFileRoute("/_app/finance/invoicing/invoices")({
  component: () => {
    const { vatMode } = useFinanceShell();
    return <IncomeSection vatMode={vatMode} />;
  },
});
