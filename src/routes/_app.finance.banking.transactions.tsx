import { createFileRoute } from "@tanstack/react-router";
import { BankTransactionsBrowser } from "@/components/finance/bank-transactions-browser";

export const Route = createFileRoute("/_app/finance/banking/transactions")({
  component: BankTransactionsBrowser,
});
