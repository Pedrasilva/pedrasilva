import { createFileRoute } from "@tanstack/react-router";
import { ExpensesSection } from "@/components/finance/sections/legacy-sections";
import { useFinanceShell } from "@/components/finance/finance-shell-context";

export const Route = createFileRoute("/_app/finance/payments/expenses")({
  component: () => {
    const { vatMode } = useFinanceShell();
    return <ExpensesSection vatMode={vatMode} kind="all" />;
  },
});
