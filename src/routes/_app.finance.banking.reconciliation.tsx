import { createFileRoute } from "@tanstack/react-router";
import { BankReconciliationTab } from "@/components/finance/bank-reconciliation";

export const Route = createFileRoute("/_app/finance/banking/reconciliation")({
  component: BankReconciliationTab,
});
